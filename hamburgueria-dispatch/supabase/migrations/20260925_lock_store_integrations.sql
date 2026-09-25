-- Fecha store_integrations para o front (Roadmap de Estabilização, item 0.5.1).
--
-- 1. integrations_all (ALL para public, using/with check = true) anulava as
--    policies do dono, porque policies permissivas se somam com OU: qualquer
--    um com a anon key lia, alterava e apagava integrações de qualquer loja.
-- 2. Segredos (client_secret, access_token, webhook_secret) só são lidos
--    pelas Edge Functions (service role). Revogar SELECT por coluna não
--    funciona enquanto existir SELECT na tabela inteira, então tiramos o
--    SELECT da tabela e devolvemos só as colunas seguras.
--    Escrita continua liberada para authenticated e restrita pelo RLS ao
--    owner/admin (integrations_owner_manage) — o dono ainda grava segredos,
--    só não consegue lê-los de volta.

drop policy if exists integrations_all on public.store_integrations;

revoke all on public.store_integrations from anon;

revoke select, truncate, references, trigger
  on public.store_integrations
  from authenticated;

grant select (
  id, store_id, platform, client_id, token_expires_at,
  active, last_sync_at, last_error, created_at
) on public.store_integrations to authenticated;
