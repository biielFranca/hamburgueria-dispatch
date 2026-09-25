-- Tira do alcance da API pública as funções SECURITY DEFINER de uso interno
-- (Roadmap de Estabilização, item 0.5.4).
--
-- Funções SECURITY DEFINER rodam com o privilégio do dono (ignoram RLS) e
-- ficam expostas em /rest/v1/rpc/<nome>. Todas tinham EXECUTE para PUBLIC,
-- anon e authenticated: qualquer um com a anon key podia, por exemplo, dar
-- baixa de estoque em qualquer loja (deduct_stock_for_item) ou mexer na fila
-- de retry.
--
-- Levantamento (26/set/2026): o front não chama nenhuma RPC; as Edge
-- Functions chamam só recompute_all_alert_levels, com service role. Triggers
-- disparam sem precisar de EXECUTE. service_role mantém o acesso.
--
-- Mantidas de propósito (usadas dentro das policies de RLS e só devolvem
-- dados do próprio usuário): auth_role, auth_store_id, get_my_store_id,
-- get_user_store_id.

revoke execute on function public.check_idempotency(text, uuid, text)                    from public, anon, authenticated;
revoke execute on function public.check_user_login(text)                                 from public, anon, authenticated;
revoke execute on function public.deduct_stock_for_item(uuid, uuid, numeric, uuid, text) from public, anon, authenticated;
revoke execute on function public.enqueue_retry(uuid, text, jsonb, integer)              from public, anon, authenticated;
revoke execute on function public.fail_retry(uuid, text)                                 from public, anon, authenticated;
revoke execute on function public.fetch_due_retries(text, integer)                       from public, anon, authenticated;
revoke execute on function public.log_execution(uuid, text, text, integer, jsonb, text)  from public, anon, authenticated;
revoke execute on function public.purge_expired_idempotency_keys()                       from public, anon, authenticated;
revoke execute on function public.recompute_alert_levels(uuid)                           from public, anon, authenticated;
revoke execute on function public.recompute_all_alert_levels()                           from public, anon, authenticated;
revoke execute on function public.recompute_item_availability(uuid)                      from public, anon, authenticated;
revoke execute on function public.resolve_catalog_item(uuid, text, text, text)           from public, anon, authenticated;
revoke execute on function public.resolve_retry(uuid)                                    from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()                                      from public, anon, authenticated;
revoke execute on function public.trg_order_dispatch_deduct()                            from public, anon, authenticated;
revoke execute on function public.trg_order_status_audit()                               from public, anon, authenticated;

-- Garante que o backend (Edge Functions / cron com service role) continua podendo chamar.
grant execute on function public.recompute_all_alert_levels() to service_role;
