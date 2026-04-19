-- Comprehensive RLS for all main tables.
-- Pattern: authenticated user may only access rows where store_id matches
-- their own store_id from the users table.
-- service_role always bypasses RLS.

-- ── Helper: reusable inline store check ──────────────────────────────────────
-- Instead of a function (which adds complexity), each policy inlines the check.
-- This is intentional: explicit over DRY for security policies.

-- ── orders ────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_store_select  ON public.orders;
DROP POLICY IF EXISTS orders_store_insert  ON public.orders;
DROP POLICY IF EXISTS orders_store_update  ON public.orders;
DROP POLICY IF EXISTS orders_store_delete  ON public.orders;

CREATE POLICY orders_store_select ON public.orders FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY orders_store_insert ON public.orders FOR INSERT TO authenticated
  WITH CHECK (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY orders_store_update ON public.orders FOR UPDATE TO authenticated
  USING (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

-- Operators cannot delete orders (soft-cancel via status only)
-- DELETE is reserved for service_role.

-- ── dispatch_suggestions ──────────────────────────────────────────────────────

ALTER TABLE public.dispatch_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suggestions_store_select ON public.dispatch_suggestions;
DROP POLICY IF EXISTS suggestions_store_insert ON public.dispatch_suggestions;
DROP POLICY IF EXISTS suggestions_store_update ON public.dispatch_suggestions;

CREATE POLICY suggestions_store_select ON public.dispatch_suggestions FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY suggestions_store_insert ON public.dispatch_suggestions FOR INSERT TO authenticated
  WITH CHECK (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY suggestions_store_update ON public.dispatch_suggestions FOR UPDATE TO authenticated
  USING (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

-- ── dispatch_suggestion_orders ────────────────────────────────────────────────

ALTER TABLE public.dispatch_suggestion_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sug_orders_select ON public.dispatch_suggestion_orders;
DROP POLICY IF EXISTS sug_orders_insert ON public.dispatch_suggestion_orders;

CREATE POLICY sug_orders_select ON public.dispatch_suggestion_orders FOR SELECT TO authenticated
  USING (
    suggestion_id IN (
      SELECT id FROM public.dispatch_suggestions
      WHERE store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY sug_orders_insert ON public.dispatch_suggestion_orders FOR INSERT TO authenticated
  WITH CHECK (
    suggestion_id IN (
      SELECT id FROM public.dispatch_suggestions
      WHERE store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid())
    )
  );

-- ── drivers ───────────────────────────────────────────────────────────────────

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drivers_store_select ON public.drivers;
DROP POLICY IF EXISTS drivers_store_insert ON public.drivers;
DROP POLICY IF EXISTS drivers_store_update ON public.drivers;

CREATE POLICY drivers_store_select ON public.drivers FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY drivers_store_insert ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY drivers_store_update ON public.drivers FOR UPDATE TO authenticated
  USING (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

-- ── stores ────────────────────────────────────────────────────────────────────

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stores_own_select ON public.stores;
DROP POLICY IF EXISTS stores_owner_update ON public.stores;

CREATE POLICY stores_own_select ON public.stores FOR SELECT TO authenticated
  USING (id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY stores_owner_update ON public.stores FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT store_id FROM public.users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── users ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_same_store_select ON public.users;
DROP POLICY IF EXISTS users_owner_manage      ON public.users;
DROP POLICY IF EXISTS users_self_select       ON public.users;

CREATE POLICY users_self_select ON public.users FOR SELECT TO authenticated
  USING (auth_id = auth.uid());

CREATE POLICY users_same_store_select ON public.users FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY users_owner_manage ON public.users FOR ALL TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM public.users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM public.users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── dispatch_alerts ───────────────────────────────────────────────────────────

ALTER TABLE public.dispatch_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alerts_store_select ON public.dispatch_alerts;
DROP POLICY IF EXISTS alerts_store_insert ON public.dispatch_alerts;

CREATE POLICY alerts_store_select ON public.dispatch_alerts FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY alerts_store_insert ON public.dispatch_alerts FOR INSERT TO authenticated
  WITH CHECK (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));

-- ── store_integrations (if exists) ───────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'store_integrations') THEN
    ALTER TABLE public.store_integrations ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS integrations_owner_select ON public.store_integrations;
    DROP POLICY IF EXISTS integrations_owner_manage ON public.store_integrations;

    EXECUTE $p$
      CREATE POLICY integrations_owner_select ON public.store_integrations FOR SELECT TO authenticated
        USING (store_id IN (
          SELECT store_id FROM public.users
          WHERE auth_id = auth.uid() AND role IN ('owner','admin')
        ));
      CREATE POLICY integrations_owner_manage ON public.store_integrations FOR ALL TO authenticated
        USING (store_id IN (
          SELECT store_id FROM public.users
          WHERE auth_id = auth.uid() AND role IN ('owner','admin')
        ))
        WITH CHECK (store_id IN (
          SELECT store_id FROM public.users
          WHERE auth_id = auth.uid() AND role IN ('owner','admin')
        ));
    $p$;
  END IF;
END $$;
