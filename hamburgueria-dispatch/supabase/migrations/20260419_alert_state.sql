-- Alert state migration
-- Adds alert_level column to orders, computed and maintained by backend.
-- Frontend reads this column instead of computing severity itself.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS alert_level text
    CHECK (alert_level IN ('warning', 'urgent', 'overdue'))
    DEFAULT NULL;

COMMENT ON COLUMN orders.alert_level IS
  'Backend-computed alert severity: warning (5min), urgent (9min), overdue (10min+). NULL = no alert.';

-- ── Function: recompute alert_level for all active orders in a store ──────────

CREATE OR REPLACE FUNCTION recompute_alert_levels(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  WARNING_S  constant int := 5  * 60;   -- 300s
  URGENT_S   constant int := 9  * 60;   -- 540s
  OVERDUE_S  constant int := 10 * 60;   -- 600s
BEGIN
  UPDATE orders
  SET alert_level = CASE
    WHEN extract(epoch FROM (now() - created_at)) >= OVERDUE_S THEN 'overdue'
    WHEN extract(epoch FROM (now() - created_at)) >= URGENT_S  THEN 'urgent'
    WHEN extract(epoch FROM (now() - created_at)) >= WARNING_S THEN 'warning'
    ELSE NULL
  END
  WHERE store_id = p_store_id
    AND status NOT IN ('dispatched', 'delivered', 'cancelled', 'dispatch_timeout', 'external_monitoring');
END;
$$;

-- ── Function: recompute all stores (called by cron edge function) ─────────────

CREATE OR REPLACE FUNCTION recompute_all_alert_levels()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  WARNING_S  constant int := 5  * 60;
  URGENT_S   constant int := 9  * 60;
  OVERDUE_S  constant int := 10 * 60;
BEGIN
  UPDATE orders
  SET alert_level = CASE
    WHEN extract(epoch FROM (now() - created_at)) >= OVERDUE_S THEN 'overdue'
    WHEN extract(epoch FROM (now() - created_at)) >= URGENT_S  THEN 'urgent'
    WHEN extract(epoch FROM (now() - created_at)) >= WARNING_S THEN 'warning'
    ELSE NULL
  END
  WHERE status NOT IN ('dispatched', 'delivered', 'cancelled', 'dispatch_timeout', 'external_monitoring');

  -- Clear alert_level on terminal orders
  UPDATE orders
  SET alert_level = NULL
  WHERE status IN ('dispatched', 'delivered', 'cancelled', 'dispatch_timeout', 'external_monitoring')
    AND alert_level IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_alert_levels(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION recompute_all_alert_levels()  TO service_role;
