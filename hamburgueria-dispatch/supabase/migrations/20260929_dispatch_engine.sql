-- Roadmap 1.2 — one server-side implementation of classification + routing.
--
-- Every order is inserted as 'received' (iFood/99Food/Keeta webhooks, manual
-- form, Dev page). The dispatch-engine Edge Function classifies it (geocoding,
-- address and schedule rules) and builds route suggestions. It is called:
--   * by a trigger, right when an order arrives or the operator sends one back
--     to 'awaiting_route' (rejected / removed from a suggestion);
--   * by pg_cron every minute while a store has orders waiting — this drives
--     the solo-order wait, scheduled orders coming due and missed triggers.
-- Idle stores cost nothing: the cron gate is plain SQL.
--
-- The Edge call needs the service_role key, read from Vault. Until the owner
-- creates the secret (see below), the trigger and cron do nothing.
--
--   select vault.create_secret('<service_role key>', 'dispatch_engine_service_key');
--
-- Functions live in `private` (Decision 010: not exposed by the API).

create extension if not exists pg_net with schema extensions;

create or replace function private.call_dispatch_engine(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'dispatch_engine_service_key';

  if v_key is null then
    return;  -- not configured yet
  end if;

  perform net.http_post(
    url     := 'https://cuvhtdtkuwewslozddfw.supabase.co/functions/v1/dispatch-engine',
    body    := jsonb_build_object('store_id', p_store_id),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 60000
  );
end;
$$;

-- Runs as the inserting user (app/Edge); SECURITY DEFINER lets it read Vault.
-- Only new orders and operator requeues fire it — the engine's own
-- classification (received → awaiting_route) does not, to avoid self-calls.
create or replace function private.trg_orders_dispatch_engine()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'INSERT' and new.status = 'received')
     or (tg_op = 'UPDATE' and new.status = 'awaiting_route' and old.status = 'in_suggestion') then
    perform private.call_dispatch_engine(new.store_id);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_dispatch_engine on public.orders;
create trigger orders_dispatch_engine
  after insert or update of status on public.orders
  for each row execute function private.trg_orders_dispatch_engine();

-- Cron gate: only stores with something to do reach the Edge Function.
create or replace function private.kick_dispatch_engine()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_store uuid;
  v_count integer := 0;
begin
  for v_store in
    select distinct store_id
    from public.orders
    where status in ('received', 'awaiting_route')
       or (status = 'normalized'
           and route_eligibility = 'awaiting'
           and route_block_reason = 'scheduled'
           and estimated_delivery_at <= now() + interval '30 minutes')
  loop
    perform private.call_dispatch_engine(v_store);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

select cron.schedule('dispatch-engine-tick', '* * * * *', 'select private.kick_dispatch_engine()');

-- Delay alerts only make sense for orders the store dispatches itself.
-- Keyed on delivery/logistics type (not route_eligibility), so a 'received'
-- order not yet classified is judged correctly too.
create or replace function private.recompute_all_alert_levels()
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
               or delivery_type <> 'delivery' or logistics_type <> 'own' then null
             when extract(epoch from now() - created_at) >= overdue_s then 'overdue'
             when extract(epoch from now() - created_at) >= urgent_s  then 'urgent'
             when extract(epoch from now() - created_at) >= warning_s then 'warning'
           end as level
    from public.orders
    where alert_level is not null
       or (status not in ('dispatched', 'delivered', 'cancelled', 'dispatch_timeout')
           and delivery_type = 'delivery' and logistics_type = 'own')
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

-- Rollback:
--   select cron.unschedule('dispatch-engine-tick');
--   drop trigger if exists orders_dispatch_engine on public.orders;
--   drop function if exists private.trg_orders_dispatch_engine();
--   drop function if exists private.kick_dispatch_engine();
--   drop function if exists private.call_dispatch_engine(uuid);
