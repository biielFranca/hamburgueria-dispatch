-- Stock deduction and availability recompute.
--
-- Flow:
--   order dispatched → trg_order_dispatch_deduct fires
--   → for each order item, find catalog_item via platform_item_mapping or alias
--   → for each catalog_item, apply item_components recipe
--   → INSERT stock_movements (movement_type='sale')
--   → UPDATE inventory_items.quantity
--   → recompute_item_availability() checks rupture rules
--   → UPDATE item_availability_state if item hits rupture

-- ── Function: map order item name → catalog_item_id ──────────────────────────

CREATE OR REPLACE FUNCTION resolve_catalog_item(
  p_store_id    uuid,
  p_platform    text,
  p_ext_code    text,
  p_item_name   text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- 1. Exact platform mapping by external code
  SELECT catalog_item_id INTO v_id
  FROM platform_item_mapping
  WHERE store_id = p_store_id AND platform = p_platform AND external_code = p_ext_code
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 2. Alias match (case-insensitive)
  SELECT catalog_item_id INTO v_id
  FROM catalog_item_aliases
  WHERE store_id = p_store_id AND lower(alias) = lower(p_item_name)
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 3. Exact name match on catalog_items
  SELECT id INTO v_id
  FROM catalog_items
  WHERE store_id = p_store_id AND lower(name) = lower(p_item_name) AND active = true
  LIMIT 1;

  RETURN v_id;  -- NULL if not found
END;
$$;

-- ── Function: deduct stock for one catalog_item × quantity sold ───────────────

CREATE OR REPLACE FUNCTION deduct_stock_for_item(
  p_store_id      uuid,
  p_catalog_item_id uuid,
  p_qty_sold      numeric,
  p_order_id      uuid,
  p_actor_type    text DEFAULT 'system'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT ic.inventory_item_id, ic.quantity_used
    FROM item_components ic
    WHERE ic.catalog_item_id = p_catalog_item_id
      AND ic.store_id = p_store_id
  LOOP
    -- Insert movement
    INSERT INTO stock_movements (
      store_id, inventory_item_id, quantity, movement_type, reference_id, actor_type
    ) VALUES (
      p_store_id, r.inventory_item_id,
      -(r.quantity_used * p_qty_sold),  -- negative = consumed
      'sale', p_order_id, p_actor_type
    );

    -- Decrement balance
    UPDATE inventory_items
    SET quantity = quantity - (r.quantity_used * p_qty_sold),
        updated_at = now()
    WHERE id = r.inventory_item_id;
  END LOOP;
END;
$$;

-- ── Function: recompute availability for items linked to an inventory_item ────

CREATE OR REPLACE FUNCTION recompute_item_availability(p_inventory_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        record;
  v_qty    numeric;
  v_rupture numeric;
BEGIN
  SELECT quantity INTO v_qty FROM inventory_items WHERE id = p_inventory_item_id;

  SELECT rupture_level INTO v_rupture
  FROM inventory_thresholds WHERE inventory_item_id = p_inventory_item_id;

  IF v_rupture IS NULL THEN v_rupture := 0; END IF;

  -- Find all catalog items that use this inventory item and have auto_pause rules
  FOR r IN
    SELECT ar.catalog_item_id, ar.store_id, ar.requires_approval
    FROM availability_rules ar
    WHERE ar.inventory_item_id = p_inventory_item_id AND ar.auto_pause = true
  LOOP
    IF v_qty <= v_rupture THEN
      -- Mark unavailable
      INSERT INTO item_availability_state (catalog_item_id, store_id, available, reason, updated_at)
      VALUES (r.catalog_item_id, r.store_id, false, 'stock_rupture', now())
      ON CONFLICT (store_id, catalog_item_id)
      DO UPDATE SET available = false, reason = 'stock_rupture', updated_at = now()
      WHERE item_availability_state.requires_approval IS DISTINCT FROM true
         OR NOT r.requires_approval;
    ELSE
      -- Restore availability if back above rupture
      UPDATE item_availability_state
      SET available = true, reason = NULL, updated_at = now()
      WHERE catalog_item_id = r.catalog_item_id
        AND store_id = r.store_id
        AND reason = 'stock_rupture';
    END IF;
  END LOOP;
END;
$$;

-- ── Trigger: fire on orders.status → 'dispatched' ────────────────────────────

CREATE OR REPLACE FUNCTION trg_order_dispatch_deduct()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item       jsonb;
  v_cat_id   uuid;
  v_ext_code text;
  v_qty      numeric;
  v_inv_id   uuid;
BEGIN
  -- Only fire when transitioning TO dispatched
  IF NEW.status <> 'dispatched' OR OLD.status = 'dispatched' THEN
    RETURN NEW;
  END IF;

  -- Iterate over order items (JSONB array)
  FOR item IN SELECT jsonb_array_elements(NEW.items)
  LOOP
    v_ext_code := item->>'external_code';
    v_qty      := COALESCE((item->>'quantity')::numeric, 1);

    v_cat_id := resolve_catalog_item(
      NEW.store_id,
      NEW.platform,
      COALESCE(v_ext_code, ''),
      COALESCE(item->>'name', '')
    );

    IF v_cat_id IS NOT NULL THEN
      PERFORM deduct_stock_for_item(NEW.store_id, v_cat_id, v_qty, NEW.id, 'system');

      -- Recompute availability for each inventory item in the recipe
      FOR v_inv_id IN
        SELECT inventory_item_id FROM item_components
        WHERE catalog_item_id = v_cat_id AND store_id = NEW.store_id
      LOOP
        PERFORM recompute_item_availability(v_inv_id);
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Stock deduction must never block dispatch
  RAISE WARNING 'trg_order_dispatch_deduct failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_dispatch_deduct ON public.orders;
CREATE TRIGGER order_dispatch_deduct
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_order_dispatch_deduct();

GRANT EXECUTE ON FUNCTION resolve_catalog_item(uuid, text, text, text)              TO service_role;
GRANT EXECUTE ON FUNCTION deduct_stock_for_item(uuid, uuid, numeric, uuid, text)    TO service_role;
GRANT EXECUTE ON FUNCTION recompute_item_availability(uuid)                         TO service_role;

COMMENT ON FUNCTION trg_order_dispatch_deduct() IS
  'On order dispatch: maps order items to catalog, applies recipes, deducts inventory, recomputes availability.';
