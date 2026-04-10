# Revisao de Seguranca - hamburgueria-dispatch

Data: 2026-04-09 (America/Sao_Paulo)

## Escopo

Foco em:
- SQL Injection
- XSS
- Vazamento de dados/sigilos
- Escopo e limites de endpoints
- Uso desnecessario de caracteres especiais

## Achados e status

### 1) [P0] Chave service-role no frontend
- Problema: uso de `VITE_SUPABASE_SERVICE_KEY` em cliente.
- Risco: credencial administrativa exposta em app distribuido.
- Correcao: removido `supabaseAdmin` e qualquer uso de service-role do frontend.
- Arquivo principal: `src/lib/supabase.ts`.
- Status: Corrigido.

### 2) [P1] Senha de operador em texto puro
- Problema: senha era persistida na tabela `users`.
- Risco: vazamento direto de credenciais.
- Correcao: senha nao e mais salva no banco de app; autenticacao criada via Supabase Auth e tabela `users` guarda apenas metadados.
- Arquivos principais: `src/pages/Users/index.tsx`, `src/types/index.ts`.
- Status: Corrigido.

### 3) [P1] Exposicao de senha na UI
- Problema: tela permitia visualizar senha de operador.
- Risco: shoulder surfing, captura de tela e abuso de sessao.
- Correcao: removida exibicao/revelacao de senha da UI e da listagem.
- Arquivo principal: `src/pages/Users/index.tsx`.
- Status: Corrigido.

### 4) [P1] Pedidos sem escopo de loja
- Problema: consulta de pedidos sem filtro `store_id`.
- Risco: vazamento cross-tenant em caso de RLS permissiva.
- Correcao: filtro explicito por `store_id` + limite de resultados + realtime filtrado por loja.
- Arquivo principal: `src/pages/Orders/index.tsx`.
- Status: Corrigido.

### 5) [P1] Segredos de integracao no cliente
- Problema: `client_secret` e fluxos sensiveis manipulados no frontend.
- Risco: exfiltracao de segredo e abuso de integracoes.
- Correcao:
  - UI nao le/exibe `client_secret`.
  - Fluxo de teste/sync usa backend (`ifood-sync`) com `store_id`.
  - Modulos de integracao frontend migrados para backend-only wrappers (sem `VITE_*_CLIENT_SECRET`).
- Arquivos principais:
  - `src/pages/Integrations/index.tsx`
  - `src/pages/Settings/index.tsx`
  - `src/pages/Dev/index.tsx`
  - `src/lib/integrations/ifood.ts`
  - `src/lib/integrations/openDelivery.ts`
  - `src/lib/ifood.ts`
- Status: Corrigido.

### 6) [P2] Pagina Dev sem bloqueio de role
- Problema: rota/pagina `dev` acessivel sem gate de autorizacao local.
- Risco: uso de acoes sensiveis por usuarios nao autorizados.
- Correcao: bloqueio de navegacao e render para `owner`.
- Arquivo principal: `src/App.tsx`.
- Status: Corrigido.

### 7) [P2] Enumeracao de usuario no login
- Problema: validacao previa e mensagens distintas.
- Risco: descoberta de contas validas por tentativa.
- Correcao: login direto com mensagem generica para falha de credenciais.
- Arquivo principal: `src/pages/Login/index.tsx`.
- Status: Corrigido.

## SQL Injection / XSS / validacao de entrada

- SQL Injection:
  - Uso predominante de Supabase client (query builder) sem concatenacao de SQL bruto nas telas revisadas.
  - Escopos e filtros explicitos reforcados em queries sensiveis (`store_id`, `limit`).

- XSS:
  - Nao foi encontrado uso de `dangerouslySetInnerHTML` nas areas alteradas.
  - Dados seguem renderizacao JSX padrao (escape automatico do React).

- Caracteres especiais:
  - `username` possui regex restritiva no cadastro e login (`^[a-z0-9._-]{3,32}$`).
  - Campos que exigem formato livre (nome/endereco) nao foram sobre-restringidos para evitar quebra funcional.

## Verificacao executada

- Build de producao:
  - Comando: `npm run build`
  - Resultado: sucesso (`tsc` + `vite build`).

- Busca por referencias sensiveis em `src`:
  - `VITE_SUPABASE_SERVICE_KEY`: nao encontrado.
  - `supabaseAdmin`: nao encontrado.
  - `check_user_login`: nao encontrado.
  - `VITE_*_CLIENT_SECRET`: nao encontrado.

## Recomendacoes finais (proxima etapa)

- Manter RLS estrita em `orders`, `users`, `drivers`, `store_integrations`.
- Criar/validar rate limit no login e endpoints sensiveis (via edge/backend/API gateway).
- Garantir que segredos estejam apenas em ambiente backend (nunca `VITE_*`).
