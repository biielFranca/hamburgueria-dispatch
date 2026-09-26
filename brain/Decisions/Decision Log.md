# Registro de Decisões

## Resumo
Decisões arquiteturais explícitas e fortemente implícitas tomadas durante o desenvolvimento da v1 do Hamburgueria Dispatch.

## Decisão 001
### Título
Tauri 2 + React para o app desktop

### Status
Aceita

### Contexto
Necessidade de um app desktop Windows com UI web e integração com o sistema operacional. Alternativas: Electron, WPF puro.

### Decisão
Tauri 2 com React + TypeScript + WebView2.

### Consequências
- Bundle menor que Electron
- Backend Rust para operações do sistema
- Dependência do WebView2 no Windows (pré-instalado no Win11, opcional no Win10)
- Ecossistema Tauri 2 ainda com maturidade limitada

### Fonte
`.planning/codebase/STACK.md`

---

## Decisão 002
### Título
Supabase como único backend

### Status
Aceita

### Contexto
Necessidade de banco de dados, auth, tempo real e edge functions. Sem servidor backend dedicado.

### Decisão
Supabase para tudo: PostgreSQL, Auth, assinaturas Realtime, Edge Functions.

### Consequências
- Sem servidor backend próprio para manter
- Integração iFood via Edge Function (evita CORS e exposição de segredos)
- Dependência do pricing/limites do Supabase
- Tempo real via assinaturas PostgRES (não websockets)

### Fonte
`.planning/codebase/INTEGRATIONS.md`

---

## Decisão 003
### Título
Esquema de e-mail sintético para autenticação

### Status
Aceita — mas sinalizada como dívida técnica

### Contexto
Operadores da loja não têm e-mails pessoais. O Supabase Auth exige formato de e-mail.

### Decisão
Derivar e-mail a partir do username: `{username}@dispatch.internal`. Nunca enviar e-mails.

### Consequências
- ✅ Simples para contas internas de operadores
- ❌ Sem recuperação de senha por e-mail
- ❌ Supabase poderia mudar regras de validação de e-mail e bloquear usuários existentes
- Risco: caminho de migração para e-mails reais é complexo

### Fonte
`hamburgueria-dispatch/src/pages/Login/index.tsx` (linha 39)

---

## Decisão 004
### Título
Sem biblioteca de roteamento — renderização condicional

### Status
Aceita

### Contexto
App desktop com janela única. Sem barra de URL, sem favoritos, sem voltar/avançar.

### Decisão
Estado `activePage: number` no `App.tsx` + renderização ternária. Sem React Router.

### Consequências
- ✅ Mais simples, menos dependências, navegação rápida
- ❌ Sem deep linking por URL
- ❌ Difícil adicionar sub-páginas no futuro sem refatoração
- Guards de página exigem verificações manuais em vez de config por rota

### Fonte
`.planning/codebase/ARCHITECTURE.md`

---

## Decisão 005
### Título
Sem Redux/Context — apenas estado local

### Status
Aceita

### Contexto
O app é relativamente simples em termos de fluxo. Preocupações com estado global: sessão, userRole, storeId.

### Decisão
Todo estado via React `useState`/`useRef`. Sessão + papel passados como props a partir do App.

### Consequências
- ✅ Menos boilerplate, modelo mental mais simples
- ❌ `store_id` buscado independentemente por cada componente — N queries duplicadas no mount
- ❌ Sem atualizações reativas entre componentes irmãos sem prop drilling

### Fonte
`.planning/codebase/ARCHITECTURE.md`

---

## Decisão 006
### Título
Componentes de polling em background em vez de serviço global

### Status
Aceita

### Contexto
Necessidade de operações contínuas em background: polling do iFood, verificação de alertas, classificação, geração de rotas.

### Decisão
Cada operação em background é um componente React (AlertSystem, IfoodPoller, ClassifierService, RouteEngineService) renderizado de forma invisível na raiz do App.

### Consequências
- ✅ Ciclo de vida atrelado à árvore React (desmontagem limpa)
- ✅ Estado fica no componente (sem acoplamento global)
- ❌ Múltiplas instâncias de setInterval competindo
- ❌ Cada componente busca storeId independentemente no mount

### Fonte
`.planning/codebase/ARCHITECTURE.md`

---

## Decisão 007
### Título
Credenciais armazenadas na tabela `store_integrations` (texto plano)

### Status
Aceita — dívida de segurança reconhecida

### Contexto
iFood e Open Delivery exigem client_id + client_secret por loja.

### Decisão
Armazenar credenciais em `store_integrations.client_secret` em texto plano. Acesso controlado por RLS (owner/admin apenas).

### Consequências
- ✅ Implementação simples
- ❌ Admin do banco ou breach expõe todas as credenciais
- Recomendação: usar Supabase Vault ou criptografar antes de armazenar

### Fonte
`.planning/codebase/CONCERNS.md`

---

## Decisão 008
### Título
VITE_SUPABASE_SERVICE_KEY no .env do frontend

### Status
Aceita — dívida de alto risco

### Contexto
Gestão de usuários exige a service role key para o cliente `supabaseAdmin`.

### Decisão
Service key fornecida via variável de ambiente `VITE_SUPABASE_SERVICE_KEY`, acessível no bundle do browser.

### Consequências
- ❌ Crítico: chave potencialmente exposta no bundle de produção
- ❌ Qualquer pessoa com acesso ao binário Tauri pode extrair a chave
- Mitigação necessária: mover todas as operações admin para Supabase Edge Functions. Remover service key do frontend.

### Fonte
`.planning/codebase/CONCERNS.md`

---

## Decisão 009
### Título
Permissões como coluna JSONB na tabela users

### Status
Aceita

### Contexto
Operadores precisavam de controle granular de acesso por página, além da hierarquia simples de papéis.

### Decisão
`permissions jsonb DEFAULT '{"operational":true,"orders":true,"drivers":true}'` na tabela `users`. A função `hasAccess()` do App.tsx verifica tanto `role` quanto `permissions`.

### Consequências
- ✅ Flexível: adicionar novas permissões sem alterar o schema
- ✅ Granularidade por usuário dentro do papel de operador
- ❌ Sem enforcement no nível do banco — apenas guards no frontend

### Fonte
`task-log.md` — Bloco 9

---

## Decisão 010
### Título
Funções internas do banco no schema `private`, sem revogar EXECUTE

### Status
Aceita (26/set/2026)

### Contexto
20 funções `SECURITY DEFINER` estavam chamáveis pela API pública (`/rest/v1/rpc`). Revogar `EXECUTE` fez o Postgres desta instância (`17.6.1.104`) cair com segfault sempre que uma chamada era recusada — qualquer visitante poderia derrubar o banco.

### Decisão
Mover as funções internas para o schema `private` (não exposto por PostgREST/pg_graphql, sem `usage` para anon/authenticated) em vez de revogar `EXECUTE`. Ficam em `public` só os 4 helpers usados pelas policies (`auth_role`, `auth_store_id`, `get_my_store_id`, `get_user_store_id`) e, temporariamente, `recompute_all_alert_levels` (chamada pela Edge Function `compute-alert-state` até o cron do roadmap 1.3).

### Consequências
- ✅ Chamada pela API a função interna nem chega ao banco (404 do PostgREST)
- ✅ Triggers continuam funcionando (apontam por OID)
- ❌ Não revogar EXECUTE em funções de `public` enquanto a instância tiver o bug — usar sempre o schema `private` para funções internas novas
- ❌ Advisor continua listando os 5 itens intencionais acima

### Fonte
`supabase/migrations/20260926c_move_internal_functions_to_private.sql`, [[Roadmap de Estabilização]] item 0.5.4

---

## Decisão 011
### Título
`idempotency_keys` e `retry_queue` com RLS ligado e sem policy

### Status
Aceita (26/set/2026)

### Contexto
O advisor `rls_enabled_no_policy` aponta as duas tabelas.

### Decisão
Comportamento intencional: só o backend (Edge Functions com service role, que ignora RLS) lê e escreve nelas. Sem policy, anon e authenticated não enxergam nenhuma linha.

### Consequências
- ✅ Nenhuma exposição pela API
- ❌ O advisor continua mostrando o aviso (nível INFO) — ignorar

### Fonte
[[Roadmap de Estabilização]] item 0.5.6

---

## Decisão 012
### Título
Views de diagnóstico fora da API

### Status
Aceita (26/set/2026)

### Contexto
`recent_errors` e `order_pipeline_latency` rodavam como dono (ignorando RLS) e eram legíveis pela anon key — expunham erros e latências de todas as lojas.

### Decisão
`security_invoker = on` e sem `SELECT` para anon/authenticated. Consulta só pelo dashboard / service role. Se um dia o app precisar delas, liberar para `authenticated` (o RLS das tabelas de origem passa a valer).

### Fonte
`supabase/migrations/20260926d_secure_views_and_search_path.sql`

---

## Decisão 013
### Título
Pedido aberto há mais de 12 h é encerrado automaticamente

### Status
Aceita (26/set/2026)

### Contexto
Pedido cujo evento de fim nunca chega (evento da plataforma perdido, pedido manual que ninguém finalizou) ficava aberto para sempre: o classificador do front o regravava a cada minuto e ele contava como ativo. Os pedidos de teste #9361 e #3924 ficaram assim.

### Decisão
Job `pg_cron` `close-stale-orders` (minuto 15 de cada hora) chama `private.close_stale_orders()`: pedido com `created_at` há mais de 12 h e ainda não `delivered`/`cancelled` → `dispatched` vira `delivered`, qualquer outro vira `cancelled`. Cada um ganha um `order_events` `auto_closed` (`metadata.reason = 'stale'`) para distinguir de cancelamento real.

### Consequências
- ✅ SQL puro no banco: zero invocação de Edge Function, zero egress
- ✅ Função no schema `private` (Decisão 010)
- ❌ `cancelled` automático não significa que o cliente cancelou — relatórios devem filtrar pelo evento `auto_closed`
- `pg_cron` agora está instalado; o cron do roadmap 1.3 (que também precisa de `pg_net`) continua pendente

### Fonte
`supabase/migrations/20260926f_auto_close_stale_orders.sql`

---

## Decisão 014
### Título
Pedidos do iFood por webhook, não por polling

### Status
Aceita (26/set/2026)

### Contexto
O roadmap 1.3 previa `pg_cron` + `pg_net` chamando `ifood-sync` a cada 30 s porque a API do iFood "exigia polling". A documentação atual oferece webhook para apps centralizados. Além disso, no polling a loja só fica aberta no iFood enquanto a integração consulta a cada 30 s — com o polling preso à tela Configurações, a loja ficava fechada no iFood no resto do tempo.

### Decisão
Edge Function `ifood-webhook` recebe os eventos (assinatura HMAC-SHA256 com o `client_secret`) e responde o `KEEPALIVE` de presença. `ifood-sync` fica só como reconciliação manual ("sincronizar agora"). O polling do front sai quando o webhook estiver cadastrado no portal.

### Consequências
- ✅ Pedido entra em tempo real, com o app fechado
- ✅ Loja aberta no iFood não depende de tela aberta; desativar a integração (`active = false`) faz o webhook responder 401 → loja fica offline no iFood
- ✅ Sem `pg_net`, sem chave service role no Vault, sem cron para o iFood
- ❌ Custo parecido com o cron (~2.880 KEEPALIVE/dia); o ganho é latência e presença, não preço
- ❌ Evento que falhar por 15 min é descartado pelo iFood — reconciliação pelo botão manual
- ❌ Loja aparece aberta no iFood mesmo com o app fechado — controle por loja (modo "por merchant" do KEEPALIVE) fica para depois

### Fonte
`supabase/functions/ifood-webhook/`, `supabase/functions/_shared/ifood.ts`, [iFood Developer — Webhook](https://developer.ifood.com.br/pt-BR/docs/food/guides/modules/events/webhook-overview)

---

## Notas Relacionadas
- [[Visão Geral do Projeto]]
- [[Sistema de Autenticação]]
- [[Registro de Pendências]]
- [[Arquitetura do Sistema]]
