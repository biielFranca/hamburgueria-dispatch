-- Desfaz 20260926_revoke_public_rpc_definer_functions.sql.
--
-- Chamar uma dessas funções sem EXECUTE (ex.: `set role anon; select
-- public.recompute_all_alert_levels();`) derrubou o Postgres com segfault
-- (signal 11) duas vezes em 25/set/2026 — o servidor inteiro reinicia.
-- Se a API pública puder provocar isso, qualquer visitante derruba o banco.
-- Até entender a causa, voltamos ao estado anterior e a correção do item
-- 0.5.4 passa a ser tirar essas funções do schema exposto pela API.

grant execute on function public.check_idempotency(text, uuid, text)                    to public, anon, authenticated;
grant execute on function public.check_user_login(text)                                 to public, anon, authenticated;
grant execute on function public.deduct_stock_for_item(uuid, uuid, numeric, uuid, text) to public, anon, authenticated;
grant execute on function public.enqueue_retry(uuid, text, jsonb, integer)              to public, anon, authenticated;
grant execute on function public.fail_retry(uuid, text)                                 to public, anon, authenticated;
grant execute on function public.fetch_due_retries(text, integer)                       to public, anon, authenticated;
grant execute on function public.log_execution(uuid, text, text, integer, jsonb, text)  to public, anon, authenticated;
grant execute on function public.purge_expired_idempotency_keys()                       to public, anon, authenticated;
grant execute on function public.recompute_alert_levels(uuid)                           to public, anon, authenticated;
grant execute on function public.recompute_all_alert_levels()                           to public, anon, authenticated;
grant execute on function public.recompute_item_availability(uuid)                      to public, anon, authenticated;
grant execute on function public.resolve_catalog_item(uuid, text, text, text)           to public, anon, authenticated;
grant execute on function public.resolve_retry(uuid)                                    to public, anon, authenticated;
grant execute on function public.rls_auto_enable()                                      to public, anon, authenticated;
grant execute on function public.trg_order_dispatch_deduct()                            to public, anon, authenticated;
grant execute on function public.trg_order_status_audit()                               to public, anon, authenticated;
