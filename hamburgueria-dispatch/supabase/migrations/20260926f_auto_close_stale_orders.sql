-- Orders still open 12 h after being placed are closed automatically.
--
-- Why: an order whose end event never arrives (platform event lost, manual
-- order nobody finished) stays open forever — it keeps the front-end
-- classifier re-updating it every minute and pollutes "active" counts.
--
-- Rule: created_at older than 12 h and not yet delivered/cancelled →
--   dispatched → delivered (it left the store; almost certainly delivered)
--   anything else → cancelled
-- Each closed order also gets an 'auto_closed' row in order_events so it can
-- be told apart from a real cancellation (the status trigger logs the change
-- too, as 'status_changed').
--
-- Runs hourly via pg_cron as pure SQL: no Edge Function call, no egress.
-- Function lives in `private` (Decision 010: not exposed by the API; no
-- EXECUTE revoked anywhere).

create extension if not exists pg_cron with schema pg_catalog;

create or replace function private.close_stale_orders(max_age interval default interval '12 hours')
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  closed_count integer;
begin
  with stale as (
    select id, store_id, status as old_status
    from public.orders
    where status not in ('delivered', 'cancelled')
      and created_at < now() - max_age
    for update
  ),
  closed as (
    update public.orders o
    set status = case when s.old_status = 'dispatched' then 'delivered' else 'cancelled' end
    from stale s
    where o.id = s.id
    returning o.id, o.store_id, s.old_status, o.status as new_status
  ),
  logged as (
    insert into public.order_events (order_id, store_id, event_type, actor_type, previous, next, metadata)
    select id, store_id, 'auto_closed', 'system',
           jsonb_build_object('status', old_status),
           jsonb_build_object('status', new_status),
           jsonb_build_object('reason', 'stale', 'max_age', max_age::text)
    from closed
    returning 1
  )
  select count(*) into closed_count from logged;

  return closed_count;
end;
$$;

select cron.schedule('close-stale-orders', '15 * * * *', 'select private.close_stale_orders()');

-- Rollback:
--   select cron.unschedule('close-stale-orders');
--   drop function private.close_stale_orders(interval);
