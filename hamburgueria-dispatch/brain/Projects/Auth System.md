# Sistema de Autenticação

## Resumo
Supabase Auth com esquema de e-mail sintético. Usuários têm usernames, mas o Supabase exige e-mails — por isso o fluxo de login deriva um e-mail a partir do username. Controle de acesso por papel + permissões granulares por página introduzidos na v1.

## Fonte
- `hamburgueria-dispatch/src/App.tsx`
- `hamburgueria-dispatch/src/pages/Login/index.tsx`
- `hamburgueria-dispatch/src/pages/Users/index.tsx`
- `.planning/codebase/ARCHITECTURE.md`

## Fluxo de Login
1. Usuário digita `username` + `senha` na página de Login
2. App consulta tabela `users`: `SELECT auth_id FROM users WHERE username = ?`
3. Constrói e-mail: `{username}@dispatch.internal`
4. Chama `supabase.auth.signInWithPassword({ email, password })`
5. `onAuthStateChange` dispara no App.tsx com evento `SIGNED_IN`
6. App busca `role` + `permissions` da tabela `users`
7. `localStorage.setItem('dispatch_login_at', Date.now())` — rastreamento de expiração de 8 horas
8. Sidebar e páginas renderizam de acordo com papel + permissões

## Papéis

| Papel | Acesso |
|-------|--------|
| `owner` | Todas as páginas, incluindo Usuários e Configurações |
| `admin` | Todas as páginas exceto algumas funções admin |
| `operator` | Operacional, Pedidos, Motoristas — limitado pelas permissões |

## Permissões (granulares, adição da v1)
Coluna JSON na tabela `users`:
```json
{ "operational": true, "orders": true, "drivers": true }
```
- Definidas por usuário pelo owner/admin na página Usuários
- Função `hasAccess(page)` do App.tsx verifica papel + permissões
- Sidebar oculta botões de páginas que o usuário não pode acessar

## Gerenciamento de Sessão
- Sessão de 8 horas: `checkSessionExpiry()` verifica `dispatch_login_at` no localStorage
- `onAuthStateChange` trata `SIGNED_OUT` e `TOKEN_REFRESHED` (sem sessão) → logout automático
- Supabase trata o refresh do JWT internamente

## Criação de Usuários
- Usuários criados pelo owner/admin na página Usuários
- Usa cliente `supabaseAdmin` (exige `VITE_SUPABASE_SERVICE_KEY`)
- Cria tanto: usuário no Supabase Auth + registro na tabela `users`
- Formato de e-mail: `{username}@dispatch.internal`

## Problemas Conhecidos / Dívida Técnica
- Senhas não armazenadas no banco (coluna password_hash removida ✓)
- Convenção `@dispatch.internal` = impossível recuperar senha por e-mail
- Sessão rastreada apenas via localStorage — sincronização entre abas não implementada
- `VITE_SUPABASE_SERVICE_KEY` é um segredo acessível no frontend (alto risco de segurança)

## Notas Relacionadas
- [[Schema do Banco de Dados]]
- [[Registro de Decisões]]
- [[Registro de Pendências]]
