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
| **1 — Parar o consumo** | Egress e Edge sob controle; remover duplicação | 2–3 dias | Fase 2, produção |
| **2 — Tela Operacional** | Updates incrementais + quebra do god component | 2–3 dias | — |
| **3 — Integrações confiáveis** | Testes e estrutura das Edge Functions de pedido | 2 dias | Produção |
| **4 — Pré-produção** | Plano, segredos, ensaio ponta a ponta | 1–2 dias | Primeiro turno real |
| **5 — Manutenção contínua** | Dados por feature, tipos gerados, docs | incremental | — |

Dependências: `0 → 1 → (2 ∥ 3) → 4 → 5`. Fases 2 e 3 podem correr em paralelo.

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

| Função | Chamadas/dia | Origem |
|---|---|---|
| _preencher_ | | |

### 0.4 CI mínimo
- **Por quê:** 90 testes existem mas só rodam se alguém lembrar. As fases seguintes mexem em lógica central — sem CI, regressão passa.
- **Como:** `.github/workflows/ci.yml` em `hamburgueria-dispatch/`: `npm ci` → `npx tsc --noEmit` → `npx vitest run`. Na Fase 3, adicionar `deno test` para `supabase/functions`.
- **Pronto quando:** check verde obrigatório no PR.

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
  2. **iFood:** a API exige polling. `pg_cron` a cada 30s chama `ifood-sync` via `pg_net`, autenticado por um segredo guardado no Vault (header dedicado, não a anon key). A função itera todas as lojas com integração ativa.
  3. Os componentes viram só **indicadores de status** (lendo `last_sync_at` / erro de `store_integrations`) + botão "sincronizar agora".
- **Consumo esperado:** iFood ≈ 2.880/dia + OD ≈ 288/dia ≈ 95 mil/mês, **fixo**, independente de janelas abertas.
- **Risco:** médio. Mitigação: manter o botão manual durante a transição.
- **Pronto quando:** nenhum `setInterval` chamando Edge no front; pedidos entram com o app fechado.

### 1.4 Módulo iFood único e autenticado
- **Por quê:** `src/lib/ifood.ts` e `src/lib/integrations/ifood.ts` duplicam responsabilidade; `startIfoodPolling` não é usado; `ifood.ts` chama a função com a **anon key como Bearer** e `storeId` no body — quem souber um `storeId` sincroniza loja alheia. As funções Open Delivery já derivam `storeId` do JWT (`_shared/requireStore.ts`); o iFood ficou para trás.
- **Como:**
  1. Um só `src/lib/integrations/ifood.ts` usando `supabase.functions.invoke` (manda o JWT do usuário).
  2. Nas funções `ifood-*`, usar `requireStore` e ignorar `storeId` do body (exceto na chamada do cron, autenticada pelo segredo).
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
