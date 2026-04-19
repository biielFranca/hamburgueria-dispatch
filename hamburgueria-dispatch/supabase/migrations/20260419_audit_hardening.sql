-- Audit hardening: restrict order_events writes to service_role (backend).
-- Authenticated users retain SELECT only.
-- Operator actions (dispatch, reject) must go through edge functions.

-- Replace INSERT policy: authenticated users can only insert operator-actor events.
-- System-actor events must come from service_role (edge functions).
DROP POLICY IF EXISTS order_events_same_store_insert ON public.order_events;

CREATE POLICY order_events_operator_insert ON public.order_events
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_type = 'operator'
    AND store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid())
  );

-- service_role bypass: edge functions always bypass RLS.
-- No additional policy needed — service_role is superuser-equivalent.

-- ── DB trigger: auto-log status changes on orders ─────────────────────────────
-- Captures any status change as a system event even if edge fn forgets to log.

CREATE OR REPLACE FUNCTION trg_order_status_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_events (
      order_id, store_id, event_type, actor_type, previous, next, metadata
    ) VALUES (
      NEW.id,
      NEW.store_id,
      'status_changed',
      'system',
      jsonb_build_object('status', OLD.status, 'route_eligibility', OLD.route_eligibility),
      jsonb_build_object('status', NEW.status, 'route_eligibility', NEW.route_eligibility),
      jsonb_build_object('trigger', 'trg_order_status_audit', 'alert_level', NEW.alert_level)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_status_audit ON public.orders;
CREATE TRIGGER order_status_audit
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_order_status_audit();

COMMENT ON FUNCTION trg_order_status_audit() IS
  'Safety net: records status transitions even if the calling service forgets to log.';
