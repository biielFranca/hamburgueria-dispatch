-- Order audit trail: immutable log of every status/classification transition
-- and user action touching an order. Drives history UI, disputes, and metrics.

CREATE TABLE IF NOT EXISTS public.order_events (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid         NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  store_id     uuid         NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  event_type   text         NOT NULL,
  actor_type   text         NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system','operator','platform','driver')),
  actor_id     uuid         NULL,
  previous     jsonb        NULL,
  next         jsonb        NULL,
  metadata     jsonb        NULL,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id   ON public.order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_store_id   ON public.order_events(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_event_type ON public.order_events(event_type);

-- RLS: same-store isolation (same pattern as orders).
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_events_same_store_select ON public.order_events;
CREATE POLICY order_events_same_store_select ON public.order_events
  FOR SELECT TO authenticated
  USING (
    store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS order_events_same_store_insert ON public.order_events;
CREATE POLICY order_events_same_store_insert ON public.order_events
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid())
  );

-- No UPDATE / DELETE policies → audit log is append-only.

COMMENT ON TABLE public.order_events IS
  'Append-only audit log of order transitions. Fed by classifier, route engine, dispatch, and operator actions.';
