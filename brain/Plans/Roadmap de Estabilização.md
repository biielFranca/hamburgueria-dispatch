# Roadmap de Estabilização

## Resumo
Plano para levar o Hamburgueria Dispatch do estado atual (arquitetura pronta, nunca rodou com pedido real, projeto Supabase pausado após estourar **egress** e **invocações de Edge Function**) até o primeiro turno real numa loja.

Ordem pensada para: (1) parar o consumo excessivo, (2) eliminar regra de negócio duplicada, (3) tornar a integração confiável, (4) só então refatorar por manutenibilidade.

Clean Architecture aqui é aplicada **por princípio, não por cerimônia**: fonte única de verdade, regra pura separada de I/O, funções pequenas, sem código morto. **Não** criar camadas formais (use cases em classe, ports/adapters, DI container) — é overengineering para o estágio atual.

## Fonte
Análise do código na branch `claude/awesome-mccarthy-cjblse` (set/2026):
- `hamburgueria-dispatch/src/pages/Operational/index.tsx` (1.677 linhas, 29 `useState`, 14 `supabase.from`)
- `src/components/{IfoodPoller,OpenDeliveryPoller,ClassifierService,RouteEngineService}`
- `src/lib/{classifier,routeEngine,ifood}.ts`, `src/lib/integrations/ifood.ts`
- `supabase/functions/*` (6 funções, sem `ifood-sync` / `ifood-dispatch-confirm`)
- `supabase/migrations/*` (18 migrations, nenhuma agenda cron)
- Estado do projeto Supabase: `INACTIVE` (pausado)

## Visão geral

| Fase | Objetivo | Esforço estimado | Bloqueia |
|---|---|---|---|
| **0 — Destravar** | Ter visibilidade e o código completo no repo | 0,5–1 dia | Tudo |
| **0.5 — Segurança crítica** | Fechar as brechas achadas no levantamento | 0,5–1 dia | Tudo que vem depois |
| **1 — Parar o consumo** | Egress e Edge sob controle; remover duplicação | 2–3 dias | Fase 2, produção |
| **2 — Tela Operacional** | Updates incrementais + quebra do god component | 2–3 dias | — |
| **3 — Integrações confiáveis** | Testes e estrutura das Edge Functions de pedido | 2 dias | Produção |
| **4 — Pré-produção** | Plano, segredos, ensaio ponta a ponta | 1–2 dias | Primeiro turno real |
| **5 — Manutenção contínua** | Dados por feature, tipos gerados, docs | incremental | — |

Dependências: `0 → 0.5 → 1 → (2 ∥ 3) → 4 → 5`. Fases 2 e 3 podem correr em paralelo.

Regra de ouro: **cada item vira um PR pequeno, com `tsc` e `vitest` passando e uma métrica antes/depois quando o item for de consumo.**

---

## Fase 0 — Destravar

Sem isso não dá para medir nada nem mexer com segurança.

### 0.1 Reativar o projeto Supabase
- **Por quê:** projeto pausado = sem banco, sem logs, sem advisors. Não há como validar nenhuma otimização.
- **Como:**
  1. O free permite 2 projetos ativos (hoje: `fechamento-caixa`, `minhas-financas`). Pausar um deles ou assinar o Pro.
  2. Restaurar `hamburgueria-dispatch` pelo dashboard.
  3. Rodar os advisors de segurança e performance e anotar o resultado neste documento.
- **Pronto quando:** projeto `ACTIVE_HEALTHY` e advisors registrados.

### 0.2 Trazer as funções do iFood para o repositório
- **Por quê:** o front chama `ifood-sync` (`src/lib/ifood.ts:9`) e `ifood-dispatch-confirm` (`src/lib/integrations/ifood.ts:22`), mas elas não existem em `supabase/functions/`. É código de produção fora do versionamento — não dá para revisar, testar nem recuperar.
- **Como:**
  1. `supabase functions download ifood-sync` e `ifood-dispatch-confirm` (ou copiar do dashboard).
  2. Commitar como estão, **sem alterar** (PR só de importação, para ter a linha de base).
- **Pronto quando:** `supabase/functions/ifood-*` no git, idênticas ao deploy.

### 0.3 Levantar os consumidores ocultos de Edge
- **Por quê:** o polling explica parte do estouro, mas há dois suspeitos invisíveis no repo.
- **Como:**
  1. Dashboard → Integrations → Cron: listar jobs que chamam `classify-orders`, `compute-alert-state`, `run-route-engine`. Registrar intervalo.
  2. `select store_id, platform, active, webhook_secret is not null as has_secret from store_integrations;` — webhook de loja sem segredo recebe 401 e a plataforma **reenvia** repetidamente.
  3. Logs de `function_edge_logs` das últimas 24h agrupados por função e status (`query_logs`).
- **Pronto quando:** tabela "função × chamadas/dia × origem" preenchida abaixo.

**Levantamento (25/set/2026, projeto recém-reativado):**

- Banco: 1 loja, **0 pedidos**, 0 `execution_logs`. Integrações iFood/Keeta/99Food todas `active = false`, nenhuma com `webhook_secret`.
- `pg_cron` e `pg_net` **não instalados** — não há cron consumindo Edge neste projeto.
- Edge Functions deployadas: `ifood-sync` (agora versionada em `supabase/functions/ifood-sync`), `open-delivery-*` (3), `classify-orders`, `run-route-engine`, `compute-alert-state`, e `cardapio-web-native-webhook` / `cardapio-web-native-poll` (suporte removido do código em `7d7569f`, mas **ainda deployadas** — apagar).
- `ifood-dispatch-confirm` **não existe** no deploy nem no histórico do git: a confirmação de despacho do iFood sempre falha.
- **Origem do estouro (confirmado pelo dono do projeto):** o estouro de egress/Edge foi deste projeto, meses atrás, e foi o motivo de ele ter sido pausado. Os dados de pedido e os logs daquela época não existem mais no banco, então não há como medir retroativamente — as causas continuam sendo as identificadas no código (polling por janela, processamento duplicado no cliente, `fetchAll()` por evento). A Fase 1 segue válida e necessária.

**Achados de segurança (advisors + SQL)** — plano de correção na **Fase 0.5**:

| Severidade | Achado | Ação |
|---|---|---|
| 🔴 Crítico | Policy `integrations_all` em `store_integrations`: `ALL` para `public` com `using (true)`. Qualquer um com a anon key (que vai dentro do app) lê, altera e apaga integrações — incluindo `client_secret` e `access_token` do iFood | 0.5.1 e 0.5.2 |
| 🔴 Crítico | `ifood-sync` sem autenticação (`verify_jwt = false`, sem checagem): qualquer um dispara sync de qualquer `storeId`; `testMode` funciona como proxy aberto de teste de credenciais | 0.5.3 |
| 🟠 Alto | 20 funções `SECURITY DEFINER` executáveis por `anon` via RPC (`deduct_stock_for_item`, `enqueue_retry`, `recompute_*`, `check_user_login`…) | 0.5.4 |
| 🟠 Alto | Views `recent_errors` e `order_pipeline_latency` com `SECURITY DEFINER` (ignoram RLS) | 0.5.5 |
| 🟡 Médio | `idempotency_keys` e `retry_queue` com RLS sem policy (ok se só service role acessa — confirmar) | 0.5.6 |
| 🟡 Médio | 3 funções com `search_path` mutável; proteção contra senha vazada desligada | 0.5.6 |
| ⚪ Perf | 9 policies com `auth.*()` sem `(select ...)`; 20 grupos de policies permissivas duplicadas; 15 FKs sem índice | Consolidar policies na Fase 5 — irrelevante no volume atual |

### 0.4 CI mínimo
- **Por quê:** 90 testes existem mas só rodam se alguém lembrar. As fases seguintes mexem em lógica central — sem CI, regressão passa.
- **Como:** `.github/workflows/ci.yml` em `hamburgueria-dispatch/`: `npm ci` → `npx tsc --noEmit` → `npx vitest run`. Na Fase 3, adicionar `deno test` para `supabase/functions`.
- **Pronto quando:** check verde obrigatório no PR.

---

## Fase 0.5 — Segurança crítica

Vem antes de qualquer otimização: não adianta reduzir custo de um backend em que qualquer pessoa lê as credenciais da loja. Todos os itens são pequenos, reversíveis e **não mudam comportamento para o operador legítimo**.

Regra: toda mudança de banco vira **migration versionada** em `supabase/migrations/` (nada aplicado só pelo dashboard), e depois de cada item os advisors são rodados de novo.

### Conceito: o que é uma policy (RLS)
O app fala direto com o banco usando a **anon key**, que vai embutida no executável — qualquer pessoa que baixe o app consegue extraí-la. O que impede essa pessoa de ler tudo é o **Row Level Security (RLS)**: cada tabela tem *policies*, regras que o Postgres avalia em cada consulta para decidir quais linhas aquele usuário pode ver ou alterar. Exemplo correto: "só pode ler integrações cuja `store_id` seja a loja do usuário logado".

Policies se somam com **OU**: basta uma liberar para o acesso ser liberado. Por isso uma única policy permissiva anula todas as outras.

### 0.5.1 Remover a policy `integrations_all` 🔴 — ✅ Concluído (25/set/2026)
> **Executado:** migration `supabase/migrations/20260925_lock_store_integrations.sql`, aplicada no projeto.
> **Verificado com SQL simulando cada papel:** visitante (anon) → leitura e escrita negadas; dono → lê as colunas seguras (3 linhas), **não** lê `client_secret`, consegue `update`/`insert`/`upsert` como a tela faz; operador → 0 linhas. Auditoria de policies `true`: nenhuma outra tabela tem esse padrão. Advisors: nenhum achado restante em `store_integrations`.
> **Notas:**
> - Não precisou mudar o front: as telas já selecionavam só colunas seguras e não enviam segredos.
> - Não existe tela que grave `client_secret`. Até existir (via Edge Function, nunca direto do front), segredo novo é gravado pelo dashboard do Supabase.
> - Risco a observar: `IfoodPoller` assina Realtime em `store_integrations`; com SELECT por coluna o Realtime pode recusar a assinatura. Impacto só no toggle ao vivo — o componente é substituído no item 1.3.
> - Achado lateral: o histórico de migrations do banco não bate 1:1 com `supabase/migrations/` (ex.: `minimal_stores_and_users` existe só no banco; `20260417_encrypt_integration_secrets` só no repo). Reconciliar na Fase 5 com `supabase db pull`.

- **O que é o problema:** `store_integrations` tem as policies corretas (`integrations_owner_select`, `integrations_owner_manage`, restritas ao dono da loja) **e** uma policy `integrations_all` com `ALL` (ler, inserir, alterar, apagar) para o papel `public` (inclui visitante sem login) com condição `true` (sempre verdadeira). Como policies somam com OU, a tabela está, na prática, **aberta para o mundo**. Também não há bloqueio por coluna: `client_secret`, `access_token` e `webhook_secret` são legíveis pela anon key.
- **Por quê:** é a brecha mais grave do sistema — expõe credenciais do iFood e permite apagar/trocar integrações de qualquer loja.
- **Como:**
  1. Migration `drop policy integrations_all on public.store_integrations;`.
  2. Na mesma migration, bloquear as colunas secretas para o front: `revoke select (client_secret, access_token, webhook_secret, api_aberta_token, api_aberta_webhook_token) on public.store_integrations from anon, authenticated;`. Só as Edge Functions (service role) precisam delas.
  3. Ajustar a tela de Conexões para **nunca ler** esses campos (só gravar ou mostrar "configurado ✓").
  4. Auditar se existe o mesmo padrão em outras tabelas: `select tablename, policyname, cmd, roles from pg_policies where qual = 'true' or with_check = 'true';`. Tratar cada achado do mesmo jeito.
- **Risco:** baixo. As policies do dono continuam. Testar: dono salva e ativa integração; operador não vê segredos; requisição com anon key sem login retorna vazio.
- **Pronto quando:** `select` com anon key em `store_integrations` retorna 0 linhas; advisors sem achado nessa tabela.

### 0.5.2 Rotacionar as credenciais do iFood 🔴 (ação do dono) — ✅ Concluído (25/set/2026)
> Novo `client_secret` gerado no portal e gravado pelo dashboard (não passou pelo chat nem pelo repo). `access_token`/`token_expires_at` limpos. Integração mantida `active = false` até o 0.5.3.

- **Por quê:** o `client_secret` e o `access_token` ficaram expostos publicamente desde que a policy foi criada. Remover a policy não "desvaza" o que já pode ter sido lido.
- **Como:**
  1. No Portal do Desenvolvedor iFood, gerar novo `clientSecret` (invalida o antigo).
  2. Limpar `access_token` e `token_expires_at` no banco.
  3. Gravar o novo segredo **só depois** de 0.5.1 aplicada.
- **Pronto quando:** credencial antiga revogada no portal.

### 0.5.3 Autenticar `ifood-sync` e remover funções mortas 🔴 — ✅ Concluído (25/set/2026)
> **Feito:** `ifood-sync` v11 deployada. Usa `_shared/requireStore.ts` (`resolveStoreScope`): usuário logado → `storeId` vem de `users.store_id` (body divergente → 403); chave service role → aceita `storeId` do body (é o caminho do cron do item 1.3, sem precisar de segredo extra); sem token ou token inválido → 401. `testMode` **removido** — nenhuma tela usava. Front (`src/lib/ifood.ts`) passou a enviar o JWT do usuário em vez da anon key. `tsc` limpo, 90 testes passando. Código deployado conferido contra o repo.
> **Verificado pelo dono:** as duas chamadas abaixo retornaram **401**. `cardapio-web-native-webhook` e `cardapio-web-native-poll` apagadas pelo dashboard (confirmado na listagem).
>
> Comandos de verificação (PowerShell):
> ```powershell
> curl.exe -s -o NUL -w "%{http_code}" -X POST https://cuvhtdtkuwewslozddfw.supabase.co/functions/v1/ifood-sync -H "Content-Type: application/json" -d "{}"
> curl.exe -s -o NUL -w "%{http_code}" -X POST https://cuvhtdtkuwewslozddfw.supabase.co/functions/v1/ifood-sync -H "Authorization: Bearer invalido" -H "Content-Type: application/json" -d "{}"
> ```

- **Por quê:** a função roda com `verify_jwt = false` e não checa nada: qualquer pessoa na internet dispara sync de qualquer `storeId` (consome cota Edge e a API do iFood em nome da loja). O `testMode` recebe `clientId`/`clientSecret` e responde se são válidos — um testador de credenciais aberto. As funções `cardapio-web-native-*` continuam deployadas sem uso: superfície de ataque sem benefício.
- **Como:**
  1. Em `ifood-sync`, aceitar só dois chamadores: (a) usuário logado → `storeId` derivado do JWT via `_shared/requireStore.ts`, ignorando o body; (b) o cron da Fase 1.3 → chave service role (guardada no Vault do banco). Qualquer outro → 401.
  2. `testMode`: exigir usuário logado com papel de dono.
  3. Apagar `cardapio-web-native-webhook` e `cardapio-web-native-poll` do projeto (`supabase functions delete`). O código continua no histórico do git (`f86f4e5`).
  4. A parte de front (módulo único, `functions.invoke`) continua no item 1.4.
- **Pronto quando:** chamada sem JWT/segredo → 401; lista de funções deployadas = lista em `supabase/functions/`.

### 0.5.3b Deploy desatualizado das demais Edge Functions 🔴 — ✅ Concluído (25/set/2026)
> **Feito:** redeploy a partir do repo de `compute-alert-state` (v4), `classify-orders` (v4), `run-route-engine` (v4), `open-delivery-webhook` (v7), `open-delivery-sync` (v5), `open-delivery-dispatch-confirm` (v5). Todos empacotaram sem erro. `compute-alert-state` agora exige a chave service role (401 para qualquer outro).
> **Bug achado no caminho:** o comentário `*/30 * * * * *` em `compute-alert-state/index.ts` fechava o bloco de comentário — o arquivo do repo **não compilava** (a versão em produção era outra). Corrigido. Todas as 9 fontes de `supabase/functions` passaram por checagem de sintaxe com o compilador TypeScript antes dos deploys.
> **Verificado pelo dono** com `scripts/verify-edge-auth.ps1`: 7/7 OK — as 6 funções respondem 401 sem token (`compute-alert-state`: "service role required"); o webhook sem assinatura responde `"ok":false` (a versão antiga respondia `"ok":true`).

- **Achado (25/set/2026):** as correções de segurança do repo **nunca foram deployadas**. Datas do deploy × commits:

  | Função | Deploy em produção | Correção no repo |
  |---|---|---|
  | `open-delivery-webhook` | 20/abr | `f240e7d` (17/set) — recusa webhook sem assinatura |
  | `open-delivery-sync`, `open-delivery-dispatch-confirm` | 12/abr | `a0cae8a` (07/mai) — `storeId` do JWT |
  | `classify-orders`, `run-route-engine` | 19/abr | `a0cae8a` (07/mai) — `storeId` do JWT |
  | `compute-alert-state` | 19/abr | sem autenticação nem no repo |

  Confirmado lendo o código deployado do webhook: `if (!cleanSignature) return { ok: true }` — requisição **sem assinatura é aceita**. Qualquer um pode injetar pedidos falsos numa loja com integração Open Delivery ativa. Hoje o impacto é nulo só porque todas as integrações estão `active = false` e há 0 pedidos.
- **Por quê:** o README e o histórico dizem que isso está resolvido — em produção não está.
- **Como:**
  1. Redeploy de todas as funções a partir do repo (`supabase functions deploy` para cada uma, incluindo `_shared/`).
  2. `compute-alert-state`: aceitar só service role (é disparada por cron) usando `resolveStoreScope`/checagem do bearer.
  3. Conferir o código deployado contra o repo (mesmo procedimento do `ifood-sync`).
  4. Testes HTTP: webhook sem assinatura → recusado; sync sem JWT → 401.
  5. Regra daqui pra frente: **mudança em `supabase/functions` só é considerada concluída depois do deploy + verificação** (vira passo do CI na Fase 0.4 quando possível).
- **Pronto quando:** toda função deployada = versão do repo; testes HTTP negativos passando.

### 0.5.3c Primeiro pedido iFood ponta a ponta ✅ (25/set/2026)
Achados ao testar com a loja de teste do iFood (nenhum pedido iFood jamais tinha entrado):
- App do portal era **distribuído** (não aceita `client_credentials`); trocado por app **centralizado**. Secret colado duas vezes (198 chars) — corrigido.
- `ifood-sync` filtrava `code === 'PLACED'`, mas o iFood manda `code: 'PLC'` / `fullCode: 'PLACED'` → todo pedido era descartado. Corrigido (v13).
- Eventos eram confirmados (ack) mesmo quando o pedido falhava ao gravar → pedido perdido para sempre. Agora só confirma o que foi processado.
- Erro HTTP do `events:polling` era engolido como "sem pedidos". Agora vai para `last_error`.
- Resultado: pedidos #9361 e #3924 entraram com endereço e coordenadas; classificados como `external_monitoring` (entrega do iFood).
- **Pendente:** testar pedido com entrega própria (gera sugestão de rota). O polling do iFood só roda com a tela Configurações aberta (item 1.3).

### 0.5.4 Revogar RPC pública das funções `SECURITY DEFINER` 🟠
- **O que é o problema:** 20 funções do schema `public` rodam com privilégio do dono do banco (ignoram RLS) e ficam expostas como endpoint `/rest/v1/rpc/<nome>` para `anon` e `authenticated`. Ex.: qualquer visitante pode chamar `deduct_stock_for_item` (dar baixa em estoque de qualquer loja), `enqueue_retry`, `resolve_retry`, `recompute_*`, `check_user_login` (enumerar usuários).
- **Levantamento:** o front **não chama nenhuma RPC**; as Edge Functions chamam só `recompute_all_alert_levels` e `pg_advisory_*` com service role.
- **Como:**
  1. Migration com `revoke execute on function ... from public, anon, authenticated;` para as funções de backend e de trigger (triggers disparam sem precisar de `EXECUTE`).
  2. **Exceção:** helpers usados dentro das policies (`auth_store_id`, `auth_role`, `get_user_store_id`, `get_my_store_id`) precisam manter `EXECUTE` para `authenticated` — revogar só de `anon`.
  3. Rodar os testes de RLS manualmente: login de operador e dono, listar pedidos, aceitar sugestão, despachar.
- **Pronto quando:** advisors `anon_security_definer_function_executable` zerado; app funciona para operador e dono.

### 0.5.5 Views sem `SECURITY DEFINER` 🟠
- **Por quê:** `recent_errors` e `order_pipeline_latency` rodam com permissão do criador e ignoram RLS — um usuário de uma loja veria erros e latências de todas.
- **Como:** `alter view public.recent_errors set (security_invoker = on);` (idem para a outra). Se forem só para diagnóstico, revogar `select` de `anon, authenticated`.
- **Pronto quando:** advisor `security_definer_view` zerado.

### 0.5.6 Ajustes menores 🟡
- Fixar `search_path` em `trg_set_updated_at`, `update_updated_at`, `get_user_store_id` (`alter function ... set search_path = public, pg_temp;`).
- Ligar *Leaked password protection* em Auth → Settings (dashboard).
- `idempotency_keys` e `retry_queue`: RLS sem policy é o comportamento desejado (só service role acessa). Registrar a decisão em [[Decision Log]] para o advisor não virar ruído.

### Critério de saída da Fase 0.5
Advisors de segurança sem nenhum item ERROR/WARN, exceto os justificados por escrito; credencial do iFood rotacionada; teste manual de login + operação completa.

---

## Fase 1 — Parar o consumo (Egress + Edge) e remover duplicação

Maior impacto no custo e na correção. Os itens se sobrepõem no mesmo código, por isso vêm juntos.

### 1.1 Filtrar Realtime da tela Operacional por loja
- **Por quê:** `src/pages/Operational/index.tsx:563-565` assina `orders`, `dispatch_suggestions` e `drivers` **sem** `filter`. Com RLS ativa o Realtime não entrega linhas de outra loja ao cliente (não é vazamento), mas o servidor avalia RLS para cada mudança de cada loja, e o padrão fica inconsistente com `Orders`, `AlertSystem` e `RouteEngine`, que já filtram.
- **Como:** adicionar `filter: \`store_id=eq.${storeId}\`` nas três assinaturas e incluir `storeId` no nome do canal (`op-main-${storeId}`).
- **Risco:** baixo.
- **Pronto quando:** as três assinaturas filtradas; tela atualiza normalmente.

### 1.2 Fonte única para Classifier e Route Engine
- **Por quê:** a regra existe duas vezes (`src/lib/classifier.ts` × `supabase/functions/classify-orders`; `src/lib/routeEngine.ts` × `supabase/functions/run-route-engine`) e **já divergiu**: o front tem `handleTimeouts` e `fetchRouteGeometry`, a edge tem `getRouteDuration` e não trata timeout. Além disso, cada janela aberta roda o fallback do front (poll 60s + Realtime + escrita), o que multiplica escrita, eventos Realtime e egress pelo número de janelas.
- **Como:**
  1. Comparar as duas versões regra por regra. Tudo que só o front faz (ex.: `handleTimeouts`) é portado para a edge.
  2. Extrair as **regras puras** (5 regras do classifier, `haversineKm`, escolha de par/sequência, cálculo de timeout) para `supabase/functions/_shared/domain/*.ts` — sem imports de Supabase, `fetch` ou Deno. Arquivos puros assim são importáveis tanto pela edge quanto pelo Vitest.
  3. Apontar os testes atuais (`classifier.test.ts`, `routeEngine.test.ts`) para o módulo compartilhado.
  4. Definir quem dispara a edge: trigger/Realtime no servidor ou `pg_cron` (1 min) — **um** agendamento, não um por cliente.
  5. Apagar `ClassifierService`, `RouteEngineService`, as partes de I/O de `src/lib/classifier.ts` e `src/lib/routeEngine.ts`, e as flags `VITE_BACKEND_*`.
- **Risco:** médio — é o coração do produto. Mitigação: testes de regra antes de apagar o front; ensaio com a página Dev.
- **Pronto quando:** existe uma só implementação de cada regra, testada; nenhum processamento de domínio roda no cliente.

### 1.3 Tirar o polling de integrações do cliente
- **Por quê:** `IfoodPoller` e `OpenDeliveryPoller` chamam Edge a cada 30s **por janela e por plataforma** (até 6 chamadas/min/janela ≈ 8.600/dia). Com dev + tauri + reload do Vite duplicando intervals, estoura 500 mil/mês. E com o app fechado, pedido do iFood não entra.
- **Como:**
  1. **Open Delivery (Keeta, 99Food):** pedido entra por **webhook** (já existe, com HMAC). `open-delivery-sync` vira reconciliação via `pg_cron` a cada 5 min, iterando todas as lojas ativas numa só invocação.
  2. **iFood:** a API exige polling. `pg_cron` a cada 30s chama `ifood-sync` via `pg_net`, autenticado com a chave service role guardada no Vault (a função já aceita esse caminho desde 0.5.3). A função itera todas as lojas com integração ativa.
  3. Os componentes viram só **indicadores de status** (lendo `last_sync_at` / erro de `store_integrations`) + botão "sincronizar agora".
- **Consumo esperado:** iFood ≈ 2.880/dia + OD ≈ 288/dia ≈ 95 mil/mês, **fixo**, independente de janelas abertas.
- **Risco:** médio. Mitigação: manter o botão manual durante a transição.
- **Pronto quando:** nenhum `setInterval` chamando Edge no front; pedidos entram com o app fechado.

### 1.4 Módulo iFood único e autenticado
- **Por quê:** `src/lib/ifood.ts` e `src/lib/integrations/ifood.ts` duplicam responsabilidade; `startIfoodPolling` não é usado; `ifood.ts` chama a função com a **anon key como Bearer** e `storeId` no body — quem souber um `storeId` sincroniza loja alheia. As funções Open Delivery já derivam `storeId` do JWT (`_shared/requireStore.ts`); o iFood ficou para trás.
- **Como:**
  1. Um só `src/lib/integrations/ifood.ts` usando `supabase.functions.invoke` (manda o JWT do usuário).
  2. A autenticação do lado do servidor já foi feita em 0.5.3.
  3. Apagar `src/lib/ifood.ts`, `startIfoodPolling` e o fallback `tauriFetch` se não for mais necessário.
- **Pronto quando:** chamada sem JWT válido → 401; `storeId` sempre vem do servidor.

### 1.5 Página Dev fora do build de produção
- **Por quê:** `src/pages/Dev` (701 linhas) cria pedidos falsos e roda o route engine. Hoje é escondida só por permissão — vai dentro do executável.
- **Como:** registrar a rota e o botão da sidebar só quando `import.meta.env.DEV`; import dinâmico para o Vite descartar o módulo no build.
- **Pronto quando:** `npm run build` não contém o código da página.

### Critério de saída da Fase 1
Medir 24h de uso normal com uma janela aberta e registrar aqui:

| Métrica | Antes | Depois |
|---|---|---|
| Invocações Edge/dia | | |
| Egress/dia | | |

---

## Fase 2 — Tela Operacional

### 2.1 Extrair lógica pura antes de mexer em qualquer coisa
- **Por quê:** agrupamento de pedidos, cálculo de atraso, ordenação e "ghost" de despachados estão misturados no componente. Extrair primeiro permite testar e refatorar o resto sem medo.
- **Como:** mover para `src/pages/Operational/selectors.ts` como funções puras `(dados, agora) → resultado`; escrever testes Vitest para cada uma **antes** de alterar o componente.
- **Pronto quando:** seletores cobertos por testes; componente só os consome.

### 2.2 Updates incrementais no lugar de `fetchAll()`
- **Por quê:** cada evento Realtime (5–10 por pedido) rebaixa loja, motoristas, pedidos ativos, sugestões e finalizados de 24h. É a maior fonte de egress.
- **Como:**
  1. Hook `useOperationalData(storeId)` com `useReducer`: carga inicial uma vez; eventos `INSERT/UPDATE/DELETE` aplicados direto no estado a partir de `payload.new/old`.
  2. Finalizados de 24h saem do ciclo: carregados sob demanda (ao abrir o painel) e paginados.
  3. `fetchAll` só na reconexão (`online` / canal voltando a `SUBSCRIBED`). O poll de 60s é removido ou vai para 5 min.
  4. Sugestões com seus pedidos numa query só (view ou RPC com JOIN).
- **Risco:** médio — estado divergente se algum evento se perder. Mitigação: resync na reconexão + botão "recarregar".
- **Pronto quando:** um pedido novo gera ~0 refetch completo; egress da tela cai de forma medida.

### 2.3 Quebrar o componente
- **Por quê:** 1.677 linhas e 29 estados — impossível revisar ou testar; toda mudança arrisca regressão.
- **Como:** `index.tsx` só compõe: `useOperationalData` + `<OperationalHeader>`, `<ActiveOrdersList>`, `<SuggestionsPanel>`, `<FinalizedPanel>`, `<OperationalMap>`. Estado de UI (seleção, filtros, modais) fica local no componente que o usa.
- **Pronto quando:** nenhum arquivo da pasta acima de ~400 linhas; comportamento idêntico.

---

## Fase 3 — Integrações confiáveis

Esse código recebe os pedidos — é onde erro custa dinheiro.

### 3.1 Separar `_shared/openDelivery.ts` (857 linhas)
- **Por quê:** cliente HTTP, mapeamento de payload e assinatura HMAC no mesmo arquivo; impossível testar o mapeamento isolado.
- **Como:** `openDelivery/client.ts` (HTTP + token), `openDelivery/mapper.ts` (payload → pedido interno, puro), `openDelivery/signature.ts` (HMAC, puro).
- **Pronto quando:** mapper e signature sem nenhum I/O.

### 3.2 Testes com payloads reais
- **Por quê:** diferenças entre Keeta e 99Food ("variações mínimas" do padrão) quebram em produção, não em dev.
- **Como:** fixtures JSON de exemplo de cada plataforma em `supabase/functions/_shared/openDelivery/__fixtures__/`; `deno test` cobrindo mapeamento, assinatura válida/inválida/ausente, pedido duplicado (idempotência). Mesmo para o mapper do iFood após 0.2.
- **Pronto quando:** `deno test` no CI e verde.

### 3.3 Visibilidade de falha de integração
- **Por quê:** erro de webhook/sync hoje só aparece em log.
- **Como:** gravar `last_sync_at`, `last_error`, `last_error_at` em `store_integrations`; o indicador do item 1.3 exibe. Falhas persistentes vão para a fila de retry já existente.
- **Pronto quando:** operador vê na tela que uma integração está falhando.

---

## Fase 4 — Pré-produção

### 4.1 Supabase Pro
- **Por quê:** o free pausa por inatividade (já aconteceu) e tem cotas baixas. Uma pausa durante o turno derruba a operação.
- **Quando:** antes do primeiro dia real, não antes.

### 4.2 Criptografar segredos com Supabase Vault
- **Por quê:** `client_secret`, `webhook_secret`, `api_aberta_*` estão em texto puro — a migration de pgsodium falhou por falta da extensão.
- **Como:** guardar cada segredo no Vault (`vault.create_secret`) e manter em `store_integrations` só a referência (id do segredo); Edge Functions leem via RPC `security definer` restrita ao service role. Migration de dados única.
- **Prioridade:** aceitável adiar com **uma** loja; obrigatório antes da segunda.

### 4.3 Ensaio ponta a ponta
- **Por quê:** o sistema nunca processou um pedido real.
- **Como:** com a loja de teste do iFood e o sandbox Open Delivery: pedido entra → classificado → sugestão → despacho → confirmação na plataforma → baixa de estoque. Repetir com app fechado, com rede caindo e com webhook duplicado. Registrar falhas em `brain/Tasks/`.
- **Pronto quando:** checklist ponta a ponta verde para cada plataforma.

### 4.4 Runbook mínimo
- **Como:** uma nota em `brain/` com: o que fazer se o Realtime cair, se a integração parar, como pausar uma plataforma, como reprocessar um pedido.

---

## Fase 5 — Manutenção contínua (incremental)

Fazer aos poucos, quando já estiver mexendo na área — nunca como "grande refactor".

| Item | Por quê | Como |
|---|---|---|
| **5.1 Acesso a dados por feature** | 9 páginas chamam `supabase.from` direto (Cardápio 15×, Estoque 11×) → `select('*')` espalhado, filtros esquecidos | `src/features/<feature>/api.ts` com funções nomeadas (`listActiveOrders(storeId)`). Sem interface de repository nem DI. Migrar uma página por vez |
| **5.2 Tipos gerados do banco** | `src/types/index.ts` é manual e diverge a cada migration; 13 `any` | `supabase gen types typescript` → `src/types/database.ts`; tipos de domínio derivados; script `npm run types` |
| **5.3 Remover `any`** | Esconde erro de tipo exatamente nas bordas (respostas de API) | Tipar respostas das Edge Functions; `unknown` + validação onde o dado vem de fora |
| **5.5 Provedor de mapa com chave** ✅ (25/set: MapTiler `streets-v2-dark` @2x no Painel Operacional via `VITE_MAPTILER_KEY`; fallback OSM sem chave. Pendente: restringir origens da chave no painel da MapTiler — formato só domínio: `localhost`, `tauri.localhost`) | CARTO passou a exigir API key (mapa quebrou); trocado por tiles do OpenStreetMap, cuja política de uso não permite uso intenso por app comercial | Antes de ter várias lojas: MapTiler ou Stadia (plano gratuito com chave), URL/chave via `.env` |
| **5.6 Migrar para as chaves novas do Supabase** | Legacy `anon`/`service_role` serão descontinuadas; `requireStore.ts` e `compute-alert-state` comparam com a `service_role` legacy | Trocar `.env` para `sb_publishable_…`, ajustar a checagem de service role nas funções, testar e só então desativar as legacy. **Não** clicar em "Disable JWT-based API keys" antes disso |
| **5.4 Atualizar o vault** | `Pending Work Register` e `Roadmap` citam problemas já resolvidos (service key no front, zero testes, IfoodPoller) | Marcar resolvidos, apontar para esta nota |

---

## Fora de escopo até o primeiro turno real
- Camadas formais de Clean Architecture, classes de use case, DI.
- Redux/Zustand; React Query (reavaliar depois da Fase 2).
- Trocar de backend — o problema medido foi desperdício do código, não capacidade do Supabase.
- Backend Bun (V3), app mobile, GPS do motoboy, suporte offline com SQLite, SocialMedia.
- Novas features de Cardápio/Estoque.

## Decisões
- Supabase mantido; estouro de egress/edge atribuído a polling no cliente, processamento duplicado por janela e refetch completo por evento.
- Regra de domínio vive só no servidor; o front renderiza e envia comandos.
- Polling de integração, quando inevitável (iFood), roda **uma vez** no servidor via `pg_cron`.

## Related Notes
- [[Roadmap]]
- [[Pending Work Register]]
- [[System Architecture]]
- [[iFood Integration]]
- [[Open Delivery Integration]]
