-- Observability: structured execution log for backend processes.
-- Records runs of classify-orders, run-route-engine, compute-alert-state, etc.
-- Used for debugging, latency tracking, and error identification.

CREATE TABLE IF NOT EXISTS public.execution_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid        NULL REFERENCES public.stores(id) ON DELETE SET NULL,
  fn_name     text        NOT NULL,   -- edge function or process name
  outcome     text        NOT NULL,   -- 'success' | 'error' | 'skipped' | 'partial'
  duration_ms int         NULL,
  detail      jsonb       NULL,       -- e.g. { classified: 3, triggerEngine: true }
  error_msg   text        NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exec_logs_fn_created   ON public.execution_logs (fn_name, created_at DESC);
CREATE INDEX IF NOT EXISTS exec_logs_store_recent ON public.execution_logs (store_id, created_at DESC)
  WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS exec_logs_errors       ON public.execution_logs (fn_name, created_at DESC)
  WHERE outcome = 'error';

ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;

-- Owners can read their store's execution logs
CREATE POLICY exec_logs_owner_select ON public.execution_logs FOR SELECT TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM public.users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Only service_role inserts
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ── Function: log execution ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_execution(
  p_store_id    uuid,
  p_fn_name     text,
  p_outcome     text,
  p_duration_ms int     DEFAULT NULL,
  p_detail      jsonb   DEFAULT NULL,
  p_error_msg   text    DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.execution_logs (store_id, fn_name, outcome, duration_ms, detail, error_msg)
  VALUES (p_store_id, p_fn_name, p_outcome, p_duration_ms, p_detail, p_error_msg);
$$;

-- ── View: recent errors per function (last 24h) ───────────────────────────────

CREATE OR REPLACE VIEW public.recent_errors AS
SELECT fn_name, store_id, error_msg, detail, created_at
FROM public.execution_logs
WHERE outcome = 'error'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;

-- ── View: order pipeline latency (time between key transitions) ───────────────

CREATE OR REPLACE VIEW public.order_pipeline_latency AS
SELECT
  o.store_id,
  o.id AS order_id,
  o.platform,
  o.status,
  o.created_at,
  o.dispatched_at,
  ROUND(EXTRACT(EPOCH FROM (o.dispatched_at - o.created_at)) / 60, 1) AS minutes_to_dispatch,
  (
    SELECT MIN(created_at) FROM public.order_events
    WHERE order_id = o.id AND event_type = 'route_suggested'
  ) AS first_suggestion_at,
  (
    SELECT COUNT(*) FROM public.order_events
    WHERE order_id = o.id AND event_type = 'status_changed'
  ) AS transition_count
FROM public.orders o
WHERE o.created_at > now() - interval '7 days';

COMMENT ON TABLE public.execution_logs IS
  'Structured run log for backend edge functions. Enables latency and error monitoring.';
COMMENT ON VIEW  public.recent_errors           IS 'Edge function errors in the last 24 hours.';
COMMENT ON VIEW  public.order_pipeline_latency  IS 'Per-order time from arrival to dispatch.';
