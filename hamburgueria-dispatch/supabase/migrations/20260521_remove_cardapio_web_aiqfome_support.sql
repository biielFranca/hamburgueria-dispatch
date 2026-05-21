-- Remove deprecated Cardapio Web / aiqfome platform support.
-- Preconditions:
--   - no orders may remain with platform = 'cardapio_web'
--   - Cardapio Web integrations are disabled before deploy

do $$
begin
  if exists (
    select 1
    from public.orders
    where platform = 'cardapio_web'
  ) then
    raise exception 'Cannot remove cardapio_web support while orders still exist';
  end if;
end $$;

update public.store_integrations
set active = false,
    last_error = coalesce(last_error, 'Integracao Cardapio Web removida do sistema.')
where platform = 'cardapio_web';

alter table public.orders
  drop constraint if exists orders_platform_check;

alter table public.orders
  add constraint orders_platform_check
  check (platform = any (array['ifood'::text, '99food'::text, 'keeta'::text]));

drop index if exists public.idx_store_integrations_api_aberta_merchant;

alter table public.store_integrations
  drop column if exists api_aberta_merchant_id,
  drop column if exists api_aberta_token,
  drop column if exists api_aberta_webhook_token;
