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

## Notas Relacionadas
- [[Visão Geral do Projeto]]
- [[Sistema de Autenticação]]
- [[Registro de Pendências]]
- [[Arquitetura do Sistema]]
