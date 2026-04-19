-- Inventory domain: stock as operational constraint.
-- inventory_items   → ingredients/supplies with current balance
-- stock_movements   → append-only ledger of quantity changes
-- item_components   → recipe: catalog_item → list of inventory_items + quantity
-- inventory_thresholds → critical/rupture levels per item

-- ── inventory_items ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid    NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name         text    NOT NULL,
  unit         text    NOT NULL DEFAULT 'un',  -- un, kg, g, L, ml, cx, pct, dz
  quantity     numeric(12,3) NOT NULL DEFAULT 0,
  min_quantity numeric(12,3) NOT NULL DEFAULT 0,  -- alert threshold
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_items_store ON public.inventory_items (store_id);
CREATE INDEX IF NOT EXISTS inventory_items_low_stock ON public.inventory_items (store_id)
  WHERE quantity <= min_quantity;

-- ── stock_movements ───────────────────────────────────────────────────────────
-- Append-only ledger. quantity is signed: positive = in, negative = out.

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid    NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  inventory_item_id uuid  NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity        numeric(12,3) NOT NULL,  -- signed
  movement_type   text    NOT NULL,  -- 'sale' | 'manual_in' | 'manual_out' | 'adjustment' | 'waste'
  reference_id    uuid    NULL,      -- order_id when movement_type='sale'
  notes           text    NULL,
  actor_type      text    NOT NULL DEFAULT 'system',
  actor_id        uuid    NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_item    ON public.stock_movements (inventory_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_store   ON public.stock_movements (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_order   ON public.stock_movements (reference_id)
  WHERE reference_id IS NOT NULL;

-- ── item_components (recipe) ──────────────────────────────────────────────────
-- Defines which inventory_items are consumed when a catalog_item is sold.

CREATE TABLE IF NOT EXISTS public.item_components (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid    NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  catalog_item_id   uuid    NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  inventory_item_id uuid    NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity_used     numeric(12,3) NOT NULL,  -- how much is consumed per sale
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS item_components_unique
  ON public.item_components (catalog_item_id, inventory_item_id);

-- ── inventory_thresholds ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_thresholds (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid    NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  store_id          uuid    NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  warning_level     numeric(12,3) NOT NULL DEFAULT 0,
  rupture_level     numeric(12,3) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_thresholds_unique
  ON public.inventory_thresholds (inventory_item_id);

-- ── availability_rules ────────────────────────────────────────────────────────
-- Rules that trigger auto-pause of a catalog_item when stock falls below rupture.

CREATE TABLE IF NOT EXISTS public.availability_rules (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid    NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  catalog_item_id   uuid    NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  inventory_item_id uuid    NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  auto_pause        bool    NOT NULL DEFAULT true,  -- auto-update item_availability_state on rupture
  requires_approval bool    NOT NULL DEFAULT false, -- if true, operator must confirm pause
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── RLS for inventory tables ──────────────────────────────────────────────────

ALTER TABLE public.inventory_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_components      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_rules   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_items','stock_movements','item_components',
    'inventory_thresholds','availability_rules'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_store_all ON public.%I;
       CREATE POLICY %I_store_all ON public.%I FOR ALL TO authenticated
         USING (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()))
         WITH CHECK (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ── Trigger: keep inventory_items.updated_at fresh ────────────────────────────

DROP TRIGGER IF EXISTS inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

COMMENT ON TABLE public.inventory_items      IS 'Ingredients and supplies with running balance.';
COMMENT ON TABLE public.stock_movements      IS 'Append-only ledger of stock changes.';
COMMENT ON TABLE public.item_components      IS 'Recipe: how much of each ingredient a catalog item consumes.';
COMMENT ON TABLE public.inventory_thresholds IS 'Warning and rupture levels per inventory item.';
COMMENT ON TABLE public.availability_rules   IS 'Auto-pause rules: when stock ruptures, pause catalog item.';
