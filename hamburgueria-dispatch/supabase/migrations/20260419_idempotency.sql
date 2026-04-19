-- Idempotency constraints: prevent duplicate orders, suggestions, and events.

-- ── Unique order per platform ──────────────────────────────────────────────────
-- Prevents duplicate ingestion from webhook retry or iFood re-poll.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_platform_unique;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_platform_unique
    UNIQUE (store_id, platform, platform_order_id);

-- ── Guard: only one pending_review suggestion per store ───────────────────────
-- Prevents RouteEngine from creating a second suggestion while one is open.

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_suggestions_one_pending
  ON public.dispatch_suggestions (store_id)
  WHERE status = 'pending_review';

-- ── Idempotency table for edge function calls ─────────────────────────────────
-- Edge functions insert a row here before doing work; if the row already exists
-- the call was already processed (e.g. webhook retry).

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key        text        PRIMARY KEY,
  store_id   uuid        NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  fn_name    text        NOT NULL,
  result     jsonb       NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-expire keys after 24h (prevents unbounded growth)
CREATE INDEX IF NOT EXISTS idempotency_keys_created_at
  ON public.idempotency_keys (created_at);

-- Function: upsert idempotency key, returns true if key is new (proceed), false if duplicate (skip)
CREATE OR REPLACE FUNCTION check_idempotency(p_key text, p_store_id uuid, p_fn text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.idempotency_keys (key, store_id, fn_name)
  VALUES (p_key, p_store_id, p_fn)
  ON CONFLICT (key) DO NOTHING;

  RETURN FOUND;  -- true = new key (proceed), false = duplicate (skip)
END;
$$;

-- Cleanup: called by cron to remove keys older than 24h
CREATE OR REPLACE FUNCTION purge_expired_idempotency_keys()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.idempotency_keys
  WHERE created_at < now() - interval '24 hours';
$$;

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
-- idempotency_keys are internal — no authenticated access needed

GRANT EXECUTE ON FUNCTION check_idempotency(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION purge_expired_idempotency_keys()      TO service_role;

COMMENT ON TABLE public.idempotency_keys IS
  'Deduplication store for edge function invocations (webhook retries, double-submits).';
