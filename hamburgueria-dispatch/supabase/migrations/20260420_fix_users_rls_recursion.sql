-- Fix: users RLS policies referenced users itself, causing infinite recursion.
-- Solution: SECURITY DEFINER helper functions that bypass RLS when reading own row.

CREATE OR REPLACE FUNCTION auth_store_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT store_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION auth_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_role()      TO authenticated;

-- Drop recursive same-store policy (caused infinite loop querying users from users policy)
DROP POLICY IF EXISTS users_same_store_select ON public.users;

-- Fix owner_manage: replace recursive subquery with SECURITY DEFINER functions
DROP POLICY IF EXISTS users_owner_manage ON public.users;
CREATE POLICY users_owner_manage ON public.users FOR ALL TO authenticated
  USING (
    store_id = auth_store_id()
    AND auth_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    store_id = auth_store_id()
    AND auth_role() IN ('owner', 'admin')
  );

-- Fix all other table policies to use auth_store_id() instead of recursive subquery

-- orders
DROP POLICY IF EXISTS orders_store_select ON public.orders;
DROP POLICY IF EXISTS orders_store_insert ON public.orders;
DROP POLICY IF EXISTS orders_store_update ON public.orders;
CREATE POLICY orders_store_select ON public.orders FOR SELECT TO authenticated USING (store_id = auth_store_id());
CREATE POLICY orders_store_insert ON public.orders FOR INSERT TO authenticated WITH CHECK (store_id = auth_store_id());
CREATE POLICY orders_store_update ON public.orders FOR UPDATE TO authenticated USING (store_id = auth_store_id());

-- dispatch_suggestions
DROP POLICY IF EXISTS suggestions_store_select ON public.dispatch_suggestions;
DROP POLICY IF EXISTS suggestions_store_insert ON public.dispatch_suggestions;
DROP POLICY IF EXISTS suggestions_store_update ON public.dispatch_suggestions;
CREATE POLICY suggestions_store_select ON public.dispatch_suggestions FOR SELECT TO authenticated USING (store_id = auth_store_id());
CREATE POLICY suggestions_store_insert ON public.dispatch_suggestions FOR INSERT TO authenticated WITH CHECK (store_id = auth_store_id());
CREATE POLICY suggestions_store_update ON public.dispatch_suggestions FOR UPDATE TO authenticated USING (store_id = auth_store_id());

-- dispatch_suggestion_orders
DROP POLICY IF EXISTS sug_orders_select ON public.dispatch_suggestion_orders;
DROP POLICY IF EXISTS sug_orders_insert ON public.dispatch_suggestion_orders;
CREATE POLICY sug_orders_select ON public.dispatch_suggestion_orders FOR SELECT TO authenticated
  USING (suggestion_id IN (SELECT id FROM public.dispatch_suggestions WHERE store_id = auth_store_id()));
CREATE POLICY sug_orders_insert ON public.dispatch_suggestion_orders FOR INSERT TO authenticated
  WITH CHECK (suggestion_id IN (SELECT id FROM public.dispatch_suggestions WHERE store_id = auth_store_id()));

-- drivers
DROP POLICY IF EXISTS drivers_store_select ON public.drivers;
DROP POLICY IF EXISTS drivers_store_insert ON public.drivers;
DROP POLICY IF EXISTS drivers_store_update ON public.drivers;
CREATE POLICY drivers_store_select ON public.drivers FOR SELECT TO authenticated USING (store_id = auth_store_id());
CREATE POLICY drivers_store_insert ON public.drivers FOR INSERT TO authenticated WITH CHECK (store_id = auth_store_id());
CREATE POLICY drivers_store_update ON public.drivers FOR UPDATE TO authenticated USING (store_id = auth_store_id());

-- stores
DROP POLICY IF EXISTS stores_own_select   ON public.stores;
DROP POLICY IF EXISTS stores_owner_update ON public.stores;
CREATE POLICY stores_own_select ON public.stores FOR SELECT TO authenticated USING (id = auth_store_id());
CREATE POLICY stores_owner_update ON public.stores FOR UPDATE TO authenticated
  USING (id = auth_store_id() AND auth_role() IN ('owner', 'admin'));

-- dispatch_alerts
DROP POLICY IF EXISTS alerts_store_select ON public.dispatch_alerts;
DROP POLICY IF EXISTS alerts_store_insert ON public.dispatch_alerts;
CREATE POLICY alerts_store_select ON public.dispatch_alerts FOR SELECT TO authenticated USING (store_id = auth_store_id());
CREATE POLICY alerts_store_insert ON public.dispatch_alerts FOR INSERT TO authenticated WITH CHECK (store_id = auth_store_id());

-- execution_logs
DROP POLICY IF EXISTS exec_logs_owner_select ON public.execution_logs;
CREATE POLICY exec_logs_owner_select ON public.execution_logs FOR SELECT TO authenticated
  USING (store_id = auth_store_id() AND auth_role() IN ('owner', 'admin'));

-- catalog tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_categories','catalog_items','catalog_item_aliases',
    'platform_item_mapping','item_availability_state'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_store_all ON public.%I;
       CREATE POLICY %I_store_all ON public.%I FOR ALL TO authenticated
         USING (store_id = auth_store_id())
         WITH CHECK (store_id = auth_store_id());',
      t, t, t, t
    );
  END LOOP;
END $$;

-- inventory tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_items','stock_movements','item_components',
    'inventory_thresholds','availability_rules'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_store_all ON public.%I;
       CREATE POLICY %I_store_all ON public.%I FOR ALL TO authenticated
         USING (store_id = auth_store_id())
         WITH CHECK (store_id = auth_store_id());',
      t, t, t, t
    );
  END LOOP;
END $$;
