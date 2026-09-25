-- Tira as funções SECURITY DEFINER internas do alcance da API pública
-- (Roadmap de Estabilização, item 0.5.4 — abordagem B).
--
-- A abordagem A (revogar EXECUTE, 20260926_*) foi revertida: nesta instância,
-- chamar uma função sem EXECUTE derruba o Postgres com segfault. Aqui nada é
-- revogado nas funções: elas vão para o schema `private`, que o PostgREST e o
-- pg_graphql não expõem, então /rest/v1/rpc/<nome> nem chega ao banco.
--
-- - Triggers e event trigger apontam para a função por OID: continuam
--   funcionando após o SET SCHEMA.
-- - trg_order_dispatch_deduct chama deduct_stock_for_item,
--   resolve_catalog_item e recompute_item_availability sem schema: o
--   search_path dela passa a incluir `private`.
-- - Exceção temporária: recompute_all_alert_levels fica em `public` porque a
--   Edge Function compute-alert-state a chama via RPC. É idempotente e não
--   expõe dados; vai para `private` quando o cron do item 1.3 a chamar direto.
-- - Mantidos em `public` (usados pelas policies de RLS): auth_role,
--   auth_store_id, get_my_store_id, get_user_store_id.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter function public.check_idempotency(text, uuid, text)                    set schema private;
alter function public.check_user_login(text)                                 set schema private;
alter function public.deduct_stock_for_item(uuid, uuid, numeric, uuid, text) set schema private;
alter function public.enqueue_retry(uuid, text, jsonb, integer)              set schema private;
alter function public.fail_retry(uuid, text)                                 set schema private;
alter function public.fetch_due_retries(text, integer)                       set schema private;
alter function public.log_execution(uuid, text, text, integer, jsonb, text)  set schema private;
alter function public.purge_expired_idempotency_keys()                       set schema private;
alter function public.recompute_alert_levels(uuid)                           set schema private;
alter function public.recompute_item_availability(uuid)                      set schema private;
alter function public.resolve_catalog_item(uuid, text, text, text)           set schema private;
alter function public.resolve_retry(uuid)                                    set schema private;
alter function public.rls_auto_enable()                                      set schema private;
alter function public.trg_order_dispatch_deduct()                            set schema private;
alter function public.trg_order_status_audit()                               set schema private;

alter function private.trg_order_dispatch_deduct() set search_path = public, private, pg_temp;
