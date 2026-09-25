-- Roadmap de Estabilização, itens 0.5.5 e 0.5.6.
--
-- 0.5.5 — Views de diagnóstico
-- recent_errors e order_pipeline_latency rodavam com permissão do dono
-- (ignorando RLS) e tinham SELECT para anon: qualquer um com a anon key lia
-- erros das Edge Functions e latências de todas as lojas. Nenhum código do app
-- usa essas views (só diagnóstico). Passam a respeitar RLS de quem consulta e
-- saem da API; continuam acessíveis pelo dashboard / service_role.
-- (Recusa em view/tabela não dispara o segfault visto com funções.)

alter view public.recent_errors          set (security_invoker = on);
alter view public.order_pipeline_latency set (security_invoker = on);
revoke all on public.recent_errors          from anon, authenticated;
revoke all on public.order_pipeline_latency from anon, authenticated;

-- 0.5.6 — search_path fixo (evita sequestro por objeto com mesmo nome em
-- outro schema). Apontado pelo advisor function_search_path_mutable.
alter function public.trg_set_updated_at() set search_path = public, pg_temp;
alter function public.update_updated_at()  set search_path = public, pg_temp;
alter function public.get_user_store_id()  set search_path = public, pg_temp;
