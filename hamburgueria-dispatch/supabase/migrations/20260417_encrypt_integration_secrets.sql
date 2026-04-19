-- Encrypt client_secret and webhook_secret at rest in store_integrations.
-- Uses pgsodium Transparent Column Encryption: values are stored encrypted,
-- automatically decrypted via a view, and never exposed through the anon key.
--
-- After this migration, Edge Functions MUST read secrets from the
-- `store_integrations_decrypted` view (runs as service_role) instead of
-- `store_integrations` directly.

create extension if not exists pgsodium;

-- 1. Mark the two sensitive columns for encryption at rest.
--    pgsodium replaces the stored value with a bytea ciphertext and creates
--    a decrypted_<col> shadow column behind a security-definer view.
security label for pgsodium
  on column public.store_integrations.client_secret
  is 'ENCRYPT WITH KEY COLUMN store_id ASSOCIATED (platform) NONCE COLUMN nonce';

security label for pgsodium
  on column public.store_integrations.webhook_secret
  is 'ENCRYPT WITH KEY COLUMN store_id ASSOCIATED (platform) NONCE COLUMN nonce';

-- 2. Nonce column required by pgsodium TCE (one per row, auto-managed).
alter table public.store_integrations
  add column if not exists nonce bytea;

-- 3. Revoke direct SELECT on the raw encrypted columns for anon/authenticated.
--    Writes still go through the table; reads of secrets must use the view below.
revoke select (client_secret, webhook_secret)
  on public.store_integrations
  from anon, authenticated;

-- 4. Decrypted view restricted to service_role (Edge Functions).
create or replace view public.store_integrations_decrypted as
  select
    id,
    store_id,
    platform,
    active,
    client_id,
    access_token,
    token_expires_at,
    last_sync_at,
    last_error,
    created_at,
    updated_at,
    pgsodium.decrypted_columns(store_integrations) as decrypted
  from public.store_integrations;

revoke all on public.store_integrations_decrypted from anon, authenticated;
grant select on public.store_integrations_decrypted to service_role;

comment on view public.store_integrations_decrypted is
  'Service-role-only view exposing decrypted client_secret / webhook_secret. Frontend must never query this view.';
