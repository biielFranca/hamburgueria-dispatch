-- Cardápio Web "API Aberta" (native REST) credentials.
-- Lives alongside existing Open Delivery credentials for the same platform
-- ('cardapio_web'), so we add new columns instead of a new row type.
--
-- api_aberta_merchant_id: numeric `código da loja` (e.g. 19856) used to
--   resolve store_id when webhooks arrive. Indexed for O(1) lookup.
-- api_aberta_token: per-store token sent in header X-API-KEY on every request.
-- api_aberta_webhook_token: optional token echoed back in X-Webhook-Token
--   header on incoming webhooks. Stored alongside api_aberta_token.
--
-- NOTE: pgsodium TCE is not available in this project (see 20260417 migration
-- — pgsodium extension missing on the instance). Both secrets stay as plain
-- text, protected only by column-level privileges + service-role RLS. If/when
-- pgsodium or Supabase Vault is re-enabled, add encryption here AND migrate
-- client_secret / webhook_secret together.

alter table public.store_integrations
  add column if not exists api_aberta_merchant_id integer,
  add column if not exists api_aberta_token text,
  add column if not exists api_aberta_webhook_token text;

-- Revoke direct read of the secret columns from anon/authenticated roles.
revoke select (api_aberta_token, api_aberta_webhook_token)
  on public.store_integrations
  from anon, authenticated;

-- Fast lookup: "given a Cardápio Web merchant_id (from webhook), find the store".
create unique index if not exists idx_store_integrations_api_aberta_merchant
  on public.store_integrations (api_aberta_merchant_id)
  where api_aberta_merchant_id is not null;

comment on column public.store_integrations.api_aberta_merchant_id is
  'Cardápio Web código da loja (e.g. 19856). Used to resolve store_id from incoming API Aberta webhooks.';

comment on column public.store_integrations.api_aberta_token is
  'Per-store token sent as X-API-KEY header to Cardápio Web API Aberta (integracao.cardapioweb.com).';

comment on column public.store_integrations.api_aberta_webhook_token is
  'Optional token the partner echoes back in X-Webhook-Token header on incoming webhooks.';
