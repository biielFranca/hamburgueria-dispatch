-- Retry queue: tracks failed integration calls for re-processing.
-- Covers: dispatch-confirm failures, sync errors, geocoding failures.

CREATE TABLE IF NOT EXISTS public.retry_queue (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  job_type     text        NOT NULL,   -- 'dispatch_confirm' | 'geocode' | 'platform_sync'
  payload      jsonb       NOT NULL,
  attempts     int         NOT NULL DEFAULT 0,
  max_attempts int         NOT NULL DEFAULT 5,
  last_error   text        NULL,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retry_queue_pending
  ON public.retry_queue (store_id, next_attempt_at)
  WHERE resolved_at IS NULL AND attempts < max_attempts;

CREATE INDEX IF NOT EXISTS retry_queue_job_type
  ON public.retry_queue (job_type, next_attempt_at)
  WHERE resolved_at IS NULL;

ALTER TABLE public.retry_queue ENABLE ROW LEVEL SECURITY;
-- Only service_role accesses retry_queue

-- ── Function: enqueue a retry job ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enqueue_retry(
  p_store_id   uuid,
  p_job_type   text,
  p_payload    jsonb,
  p_delay_s    int DEFAULT 30
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.retry_queue (store_id, job_type, payload, next_attempt_at)
  VALUES (p_store_id, p_job_type, p_payload, now() + (p_delay_s || ' seconds')::interval)
  RETURNING id;
$$;

-- ── Function: fetch due retry jobs ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION fetch_due_retries(p_job_type text, p_limit int DEFAULT 10)
RETURNS SETOF public.retry_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.retry_queue
  WHERE job_type = p_job_type
    AND resolved_at IS NULL
    AND attempts < max_attempts
    AND next_attempt_at <= now()
  ORDER BY next_attempt_at
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED;
$$;

-- ── Function: mark retry resolved ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resolve_retry(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.retry_queue
  SET resolved_at = now()
  WHERE id = p_id;
$$;

-- ── Function: record retry failure (exponential backoff) ─────────────────────

CREATE OR REPLACE FUNCTION fail_retry(p_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int;
BEGIN
  SELECT attempts INTO v_attempts FROM public.retry_queue WHERE id = p_id;
  UPDATE public.retry_queue
  SET
    attempts        = v_attempts + 1,
    last_error      = p_error,
    next_attempt_at = now() + ((30 * power(2, v_attempts)) || ' seconds')::interval
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION enqueue_retry(uuid, text, jsonb, int)  TO service_role;
GRANT EXECUTE ON FUNCTION fetch_due_retries(text, int)            TO service_role;
GRANT EXECUTE ON FUNCTION resolve_retry(uuid)                     TO service_role;
GRANT EXECUTE ON FUNCTION fail_retry(uuid, text)                  TO service_role;

COMMENT ON TABLE public.retry_queue IS
  'Persistent retry queue for failed integration calls. Backoff: 30s * 2^attempt.';
