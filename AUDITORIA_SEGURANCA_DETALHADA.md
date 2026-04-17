# Auditoria de Seguranca e Qualidade - Hamburgueria Dispatch

## Escopo
Analise focada em codigo de aplicacao, edge functions, frontend React, Tauri config e governanca de dados.

## Problemas encontrados

1. **[Critica] Edge Functions sem autenticacao JWT obrigatoria**
   - `supabase/config.toml` com `verify_jwt = false` para funcoes sensiveis (`open-delivery-sync`, `open-delivery-webhook`, `open-delivery-dispatch-confirm`, `ifood-sync`, `ifood-dispatch-confirm`).

2. **[Critica] Validacao de assinatura de webhook fail-open**
   - Em `_shared/openDelivery.ts`, `verifyWebhookSignature` aceita requisicao sem assinatura.

3. **[Alta] Assinatura do webhook validada no JSON reserializado (nao no raw body)**
   - Em `open-delivery-webhook/index.ts`, a validacao usa `JSON.stringify(payload)`.

4. **[Critica] `merchantId` vindo do cliente sobrescreve contexto da integracao**
   - `open-delivery-sync/index.ts` aceita `merchantId` no body.
   - `_shared/openDelivery.ts` prioriza `merchantId` do request sobre o persistido da loja.

5. **[Critica] Confirmacao de despacho permite resolucao por `platform_order_id` sem escopo forte de tenant**
   - Em `_shared/openDelivery.ts`, `dispatch-confirm` permite `storeId` opcional e busca pedido por `platform_order_id`.

6. **[Critica] Sincronizacao iFood disparada pelo frontend com token anonimo**
   - `src/lib/ifood.ts` chama endpoint de sync direto do cliente.

7. **[Critica] Regras criticas de classificacao/roteirizacao no frontend**
   - `ClassifierService` e `RouteEngineService` executam polling em cada cliente.
   - Mutex em memoria local (`src/lib/routeEngine.ts`) nao protege concorrencia entre usuarios.

8. **[Alta] Fluxos operacionais nao atomicos e sem pre-condicoes de status**
   - Aceitar/rejeitar/editar pedido no frontend em multiplos passos sem lock otimista.

9. **[Alta] Usuario inativo pode continuar autenticando/operando**
   - Login e bootstrap de sessao nao invalidam usuario com `active = false`.

10. **[Alta] Modelo de permissao fail-open**
    - Permissoes padrao em `true`; fallback para `null` tambem em `true`.

11. **[Alta] Operacoes por `id` sem filtro de `store_id` em varias telas**
    - Risco de IDOR caso RLS esteja incompleta/incorreta.

12. **[Alta] Governanca de schema/politicas fraca (migrations insuficientes)**
    - Pasta de migrations nao mostra evolucao de RLS, grants e constraints criticas.

13. **[Media] Vazamento de detalhes internos em respostas de erro**
    - Mensagens de excecao e erros upstream retornadas quase literal ao cliente.

14. **[Media] CORS permissivo e validacao fraca de metodo/origem**
    - Origem `*` e controles incompletos em handlers.

15. **[Media] `window.open` com URL de usuario sem validacao de protocolo**
    - Risco de redirecionamento indevido e abuso de esquemas nao esperados.

16. **[Alta] Tauri sem CSP efetiva (`csp: null`)**
    - Superficie maior para injecao de script/conteudo em ambiente desktop.

17. **[Alta] Segredo sensivel em `.env` (`VITE_SUPABASE_SERVICE_KEY`)**
    - Risco critico se valor vazar para build/client/runtime indevido.

18. **[Media] Criacao de operador nao atomica (Auth + DB separados)**
    - Pode gerar conta orfa e inconsistencias de autorizacao.

---

## Como solucionar detalhadamente

### 1) Edge Functions sem JWT obrigatoria
**Objetivo:** impedir acesso anonimo a endpoints criticos.

**Passos:**
1. Alterar `verify_jwt = true` nas funcoes sensiveis em `supabase/config.toml`.
2. Exigir e validar claims no inicio de cada handler (`sub`, `role`, `store_id` quando aplicavel).
3. Criar middleware comum de authz por tenant (ex.: `requireStoreAccess`).
4. Rejeitar qualquer request sem token valido com `401`.

**Exemplo (pseudo):**
```ts
const user = await requireAuth(req); // valida JWT + expiracao
await requireStoreAccess(user.id, storeId); // valida vinculo user->loja
```

### 2) Webhook fail-open
**Objetivo:** webhook somente com assinatura valida.

**Passos:**
1. Tornar assinatura obrigatoria: ausencia de header deve retornar `401`.
2. Validar timestamp/janela anti-replay (ex.: 5 min).
3. Implementar comparacao em tempo constante.
4. Logar tentativa invalida com metadados minimos (sem payload sensivel).

### 3) Validacao no JSON reserializado
**Objetivo:** garantir integridade criptografica correta.

**Passos:**
1. Ler corpo cru (`rawBody`) antes do parse JSON.
2. Calcular HMAC no `rawBody` exato recebido.
3. Somente apos assinatura valida, realizar `JSON.parse(rawBody)`.

**Exemplo:**
```ts
const rawBody = await req.text();
verifyHmac(rawBody, signature, secret);
const payload = JSON.parse(rawBody);
```

### 4) `merchantId` controlado por cliente
**Objetivo:** eliminar spoofing de merchant/tenant.

**Passos:**
1. Remover `merchantId` do contrato publico da API.
2. Resolver `merchantId` exclusivamente pelo `store_id` autenticado.
3. Validar no backend que `store_id` pertence ao usuario autenticado.
4. Bloquear qualquer campo inesperado no payload (schema estrito).

### 5) `dispatch-confirm` com escopo fraco por `platform_order_id`
**Objetivo:** impedir confirmacoes cross-tenant.

**Passos:**
1. Tornar `storeId` obrigatorio e derivado de contexto autenticado (nao do body livre).
2. Buscar pedido por chave composta: `store_id + platform_order_id`.
3. Adicionar indice/constraint para unicidade por tenant.
4. Em caso de nao encontrado, retornar erro generico sem indicar existencia em outra loja.

### 6) Sync iFood disparado pelo frontend
**Objetivo:** mover acao privilegiada para backend confiavel.

**Passos:**
1. Encapsular sync em endpoint backend autenticado e autorizado.
2. Frontend apenas dispara acao de alto nivel sem segredos.
3. Rotacionar chaves se houve exposicao de segredo.
4. Aplicar rate limit por loja/usuario para evitar abuso.

### 7) Classificacao e roteirizacao no frontend
**Objetivo:** centralizar regras criticas no servidor.

**Passos:**
1. Migrar engine de classificacao/roteiro para job worker server-side.
2. Implementar lock distribuido (DB advisory lock, Redis lock, ou fila).
3. Manter frontend somente como visualizacao/comando.
4. Persistir idempotency key por execucao para evitar processamentos duplicados.

### 8) Fluxos operacionais nao atomicos
**Objetivo:** evitar corrida de estado e atualizacoes conflitantes.

**Passos:**
1. Mover transicoes de estado para RPC/funcao unica no backend.
2. Validar estado atual antes de transicionar (state machine).
3. Usar transacao DB com `SELECT ... FOR UPDATE` ou lock equivalente.
4. Registrar trilha de auditoria de transicoes (quem, quando, de->para).

### 9) Usuario inativo ainda opera
**Objetivo:** bloquear sessao de usuarios revogados/inativos.

**Passos:**
1. Verificar `active` no login e em cada bootstrap de sessao.
2. Revogar tokens/sessoes quando `active` virar `false`.
3. Adicionar check de usuario ativo em middleware backend.

### 10) Permissoes fail-open
**Objetivo:** aplicar principio de menor privilegio.

**Passos:**
1. Alterar defaults para `false` (deny by default).
2. Tratar `permissions = null` como sem permissao.
3. Conceder apenas o minimo necessario por papel.
4. Adicionar teste automatizado de matriz role x acao.

**Exemplo:**
```ts
const DEFAULT_PERMISSIONS = {
  users: false,
  orders: false,
  drivers: false,
  settings: false,
};
```

### 11) Operacoes sem escopo `store_id`
**Objetivo:** evitar IDOR mesmo sob erro de policy.

**Passos:**
1. Em toda query mutavel: `where id = ? and store_id = ?`.
2. No backend, ignorar `store_id` vindo do cliente e derivar do token.
3. Revisar e testar RLS para SELECT/INSERT/UPDATE/DELETE.

### 12) Migrations/policies insuficientes
**Objetivo:** tornar seguranca auditavel e reprodutivel.

**Passos:**
1. Versionar todas alteracoes de schema, RLS, grants e constraints.
2. Criar migrations dedicadas para politicas por tabela.
3. Adicionar pipeline CI que valida drift de schema/policies.
4. Documentar modelo de acesso por papel/tenant.

### 13) Vazamento de erro interno
**Objetivo:** reduzir inteligencia para atacante e melhorar operacao.

**Passos:**
1. Retornar mensagens genericas ao cliente (`Erro interno`).
2. Logar detalhe tecnico apenas no backend (com correlation id).
3. Nunca retornar stack trace, SQL bruto, payload secreto, token.

### 14) CORS permissivo
**Objetivo:** reduzir origem nao autorizada e abuso cross-origin.

**Passos:**
1. Definir allowlist de origens por ambiente.
2. Restringir metodos e headers necessarios.
3. Rejeitar preflight/origem fora da allowlist com `403`.

### 15) `window.open` sem validacao
**Objetivo:** abrir somente URLs seguras.

**Passos:**
1. Parsear URL no backend ou frontend com validacao estrita.
2. Aceitar apenas `https://` e dominios permitidos.
3. Bloquear `javascript:`, `data:`, `file:` e esquemas customizados nao esperados.

### 16) Tauri sem CSP
**Objetivo:** endurecer app desktop contra injecao.

**Passos:**
1. Definir CSP explicita (sem `unsafe-inline`/`unsafe-eval` quando possivel).
2. Limitar `connect-src`, `img-src`, `script-src` a fontes confiaveis.
3. Revisar permissoes de capabilities para minimo necessario.

### 17) Service key em `.env`
**Objetivo:** eliminar segredo critico do escopo cliente.

**Passos:**
1. Remover `VITE_SUPABASE_SERVICE_KEY` do frontend imediatamente.
2. Rotacionar chave service-role no provedor.
3. Garantir que somente backend seguro use service-role.
4. Atualizar `.gitignore` e scanner de segredos no CI.

### 18) Criacao de operador nao atomica
**Objetivo:** consistencia entre Auth e tabela de usuarios.

**Passos:**
1. Encapsular criacao em funcao transacional server-side.
2. Se insercao no DB falhar, compensar removendo usuario Auth criado.
3. Adicionar retries controlados e idempotency key.
4. Criar alerta para contas orfas e rotina de reconciliacao.

---

## Ordem recomendada de execucao (prioridade pratica)

1. Fechar autenticacao/autorizacao de todas Edge Functions.
2. Corrigir webhook (assinatura obrigatoria + raw body + anti-replay).
3. Remover segredos do frontend e rotacionar chaves.
4. Eliminar `merchantId` do cliente e fixar escopo de tenant no backend.
5. Mover regras criticas de classificacao/roteirizacao para backend com lock distribuido.
6. Reescrever fluxos de estado de pedido em transacoes atomicas.
7. Corrigir permissao fail-open e enforcement de usuario ativo.
8. Revisar queries por `store_id` + reforcar RLS com testes.
9. Endurecer CORS/CSP e reduzir vazamento de erro.
10. Formalizar migrations/policies e observabilidade de seguranca.

## Criterios de pronto (Definition of Done de seguranca)

- Nenhuma funcao critica aceita request sem JWT valido.
- Nenhum endpoint de tenant aceita identificador de tenant vindo livre do cliente.
- Toda transicao de estado critica e atomica e auditavel.
- Role/permission opera em modelo deny-by-default.
- RLS coberta por teste automatizado de isolamento entre lojas.
- Sem segredos de alto privilegio em frontend/build publico.
- Webhook protegido por assinatura obrigatoria, raw-body HMAC e anti-replay.
