-- Roadmap 1.3/1.6 — delay alert (orders.alert_level) finally runs on a schedule.
--
-- recompute_all_alert_levels() existed since 20260419 but nothing ever called
-- it (the compute-alert-state Edge Function had no cron), so AlertSystem never
-- received a delay alert. Now pg_cron calls it straight in the database: no
-- Edge Function, no egress. compute-alert-state is retired.
--
-- Fixes made before scheduling it (each would bite once it runs every 30 s):
--  1. It rewrote alert_level on EVERY open order on every run, even unchanged.
--     With orders in the Realtime publication each rewrite is an event → a
--     fetchAll() in the Operational screen. Now only rows whose level changes.
--  2. It excluded 'external_monitoring' as a *status*, but that value lives in
--     route_eligibility. Platform-delivered and pickup orders (the store does
--     not dispatch them) would have been flagged "Pedido atrasado!" after 10 min.
--  3. It lived in `public` as SECURITY DEFINER, callable through the API.
--     Moved to `private` (Decision 010: move, never revoke EXECUTE) and made a
--     plain function — pg_cron runs it as the owner.
--
-- Thresholds unchanged (minutes since created_at): 5 warning, 9 urgent, 10 overdue.

-- Nothing depends on the public one (only the retired Edge Function called it)
drop function public.recompute_all_alert_levels();

create function private.recompute_all_alert_levels()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  warning_s constant int := 5  * 60;
  urgent_s  constant int := 9  * 60;
  overdue_s constant int := 10 * 60;
  changed   integer;
begin
  with computed as (
    select id,
           case
             when status in ('dispatched', 'delivered', 'cancelled', 'dispatch_timeout')
               or route_eligibility = 'external_monitoring' then null
             when extract(epoch from now() - created_at) >= overdue_s then 'overdue'
             when extract(epoch from now() - created_at) >= urgent_s  then 'urgent'
             when extract(epoch from now() - created_at) >= warning_s then 'warning'
           end as level
    from public.orders
    -- open orders the store dispatches, plus any row that still carries a level to clear
    where alert_level is not null
       or (status not in ('dispatched', 'delivered', 'cancelled', 'dispatch_timeout')
           and route_eligibility is distinct from 'external_monitoring')
  )
  update public.orders o
  set alert_level = c.level
  from computed c
  where o.id = c.id
    and o.alert_level is distinct from c.level;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Every 30 s: "urgent" means "dispatch within 1 minute", so a 1-minute tick
-- could skip straight to overdue.
select cron.schedule('recompute-alert-levels', '30 seconds', 'select private.recompute_all_alert_levels()');

-- Rollback:
--   select cron.unschedule('recompute-alert-levels');
