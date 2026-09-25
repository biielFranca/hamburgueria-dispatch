-- Roadmap 1.3 — iFood events arrive by webhook instead of client polling.
--
-- A webhook event carries iFood's merchantId, not our store_id, so each
-- integration needs to know its merchant. Filled automatically by
-- ifood-sync / ifood-webhook the first time an event for the store arrives.
alter table public.store_integrations add column if not exists merchant_id text;

create unique index if not exists store_integrations_platform_merchant_unique
  on public.store_integrations (platform, merchant_id)
  where merchant_id is not null;

-- ifood-webhook parks "cancelled/concluded before placed" markers in
-- idempotency_keys (events arrive out of order). The purge function existed
-- since 20260419 but was never scheduled.
select cron.schedule('purge-idempotency-keys', '30 3 * * *', 'select private.purge_expired_idempotency_keys()');

-- Rollback:
--   select cron.unschedule('purge-idempotency-keys');
--   drop index if exists public.store_integrations_platform_merchant_unique;
--   alter table public.store_integrations drop column if exists merchant_id;
