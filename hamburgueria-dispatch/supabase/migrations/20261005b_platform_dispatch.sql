-- Dispatch confirmation: when an own-delivery order becomes 'dispatched'
-- (operator accepted a route), the platform-dispatch Edge Function tells
-- iFood / 99Food / Keeta the order left the store. Replaces the app's
-- best-effort client calls. Same Vault key as dispatch-engine.
--
-- Functions live in `private` (Decision 010: not exposed by the API).

create or replace function private.call_platform_dispatch(p_order_id uuid, p_store_id uuid)
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
    url     := 'https://cuvhtdtkuwewslozddfw.supabase.co/functions/v1/platform-dispatch',
    body    := jsonb_build_object('order_id', p_order_id, 'store_id', p_store_id),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 60000
  );
end;
$$;

-- Manual (source_channel MANUAL) and Dev (platform_order_id test-…) orders
-- never reach the platform; the function skips them too.
create or replace function private.trg_orders_platform_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'dispatched' and old.status is distinct from 'dispatched'
     and new.logistics_type = 'own'
     and coalesce(new.source_channel, '') <> 'MANUAL'
     and new.platform_order_id not like 'test-%' then
    perform private.call_platform_dispatch(new.id, new.store_id);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_platform_dispatch on public.orders;
create trigger orders_platform_dispatch
  after update of status on public.orders
  for each row execute function private.trg_orders_platform_dispatch();

-- Rollback:
--   drop trigger if exists orders_platform_dispatch on public.orders;
--   drop function if exists private.trg_orders_platform_dispatch();
--   drop function if exists private.call_platform_dispatch(uuid, uuid);
