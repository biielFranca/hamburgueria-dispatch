# Task Log
> Sessão iniciada: 2026-04-09
> Arquivo de tarefas: tasks_v1.md

---

## ✅ Bloco 1 — Segurança base

### Tarefa 1: Criar `.gitignore`
**Status:** Concluída

Criado `.gitignore` na raiz com `.env`, `node_modules`, `target`, `.DS_Store`.
Atualizado `hamburgueria-dispatch/.gitignore` com `target` e `.env`.

### Tarefa 2: Corrigir RLS da tabela `users`
**Status:** Concluída

Removida política `using (true)`. Criada função `SECURITY DEFINER` `get_my_store_id()` para evitar recursão.
Nova política `users_read_own_store`: permite leitura apenas ao próprio registro ou usuários do mesmo `store_id`.

### Tarefa 3: Listener de sessão expirada no App.tsx
**Status:** Concluída

`onAuthStateChange` agora trata `SIGNED_OUT` e `TOKEN_REFRESHED` sem sessão — zera estado e redireciona para login automaticamente.

### Tarefa 4: Remover coluna `password_hash`
**Status:** Concluída

`ALTER TABLE public.users DROP COLUMN IF EXISTS password_hash` executado com sucesso.

---

## ✅ Bloco 2 — Configurações da loja

### Tarefas 5–10
**Status:** Concluídas

- Criada `src/pages/Settings/index.tsx` com proteção de rota (owner-only)
- Adicionado botão ⚙️ na Sidebar (`Sidebar.tsx`), visível apenas para `role = 'owner'`
- Formulário com campos: nome, endereço, telefone, latitude, longitude — conectado à tabela `stores`
- Mapa Leaflet interativo: clique posiciona pin e preenche lat/lng automaticamente
- Função de salvar com feedback visual de sucesso/erro
- Banner de aviso no Operational quando coordenadas da loja são nulas

---

## ✅ Bloco 3 — Classificador logístico

### Tarefas 11–18
**Status:** Concluídas

Criado `src/lib/classifier.ts` com 5 regras + default:
1. `pickup` → `blocked/pickup_order`
2. `platform` logistics → `external_monitoring`
3. lat/lng nulos → `awaiting/missing_coordinates`
4. street vazio → `blocked/invalid_address`
5. ETA > 30min → `awaiting/scheduled`
6. Default → `eligible`, status `awaiting_route`

Criado `ClassifierService` (background component) com Supabase Realtime INSERT subscription.
Montado em `App.tsx`.

---

## ✅ Bloco 4 — Motor de rotas

### Tarefas 19–27
**Status:** Concluídas

Criado `src/lib/routeEngine.ts`:
- Variáveis `VITE_ROUTES_API_KEY` e `VITE_ROUTES_API_URL` adicionadas ao `.env` (OSRM como padrão open-source)
- Busca pedidos `eligible + awaiting_route` ordenados por `rejection_count desc, created_at asc`
- Consulta OSRM (moto/bike) para calcular duração das sequências
- Compara A→B vs B→A, escolhe menor tempo
- Cria `dispatch_suggestion` com `status = pending_review` e vincula em `dispatch_suggestion_orders`
- Pedido único: aguarda 10 min, então cria sugestão solo
- Após 3 rejeições: marca `dispatch_timeout`, insere alerta em `dispatch_alerts`
- Realtime listener em `RouteEngineService` dispara engine ao `status = awaiting_route`

---

## ✅ Bloco 5 — Integração iFood

### Tarefas 28–35
**Status:** Concluídas

Criado `src/lib/integrations/ifood.ts`:
- OAuth 2.0 `client_credentials` com cache e renovação automática (5 min antes do vencimento)
- Polling de eventos a cada 30s
- Processamento `PLACED`: normaliza payload → insere em `orders` com `platform = 'ifood'`
- Processamento `CANCELLED`: atualiza status para `cancelled`
- Acknowledge após cada evento processado
- `confirmIfoodDispatch()` para aceitar despacho na plataforma
- Retry exponencial (3 tentativas) para erros 5xx/timeout

---

## ✅ Bloco 6 — Integração Open Delivery

### Tarefas 36–41
**Status:** Concluídas

Criado `src/lib/integrations/openDelivery.ts`:
- Token cache por plataforma (99Food, Keeta, Cardápio Web)
- Keeta: `alwaysPlatformLogistics = true` → `route_eligibility = external_monitoring` imediato
- Webhook handler com validação HMAC-SHA256 (Cardápio Web)
- Normalização de payload para formato interno
- `confirmOpenDeliveryDispatch()` para atualizar status na plataforma
- Retry exponencial para erros 5xx/timeout

---

## ✅ Bloco 7 — Sons dos alertas

### Tarefas 43–46
**Status:** Concluídas

Criado `src/lib/alertSound.ts`:
- `playAlert(level: '5min' | '1min' | 'critical')` com fila de reprodução (sem sobreposição)
- Tenta reproduzir arquivos MP3 de `/public/sounds/`, fallback para Web Audio API
- `isMuted()` / `setMuted()` / `toggleMute()` com persistência em `localStorage`
- `CustomEvent 'alert-mute-changed'` para sincronizar componentes

`AlertSystem` atualizado:
- Usa `playAlert()` em vez da função inline
- Renderiza `MuteButton` fixo no canto inferior direito

---

## ✅ Bloco 8 — Testes e validação

### Tarefas 47–52
**Status:** Concluídas

Dados de teste inseridos no Supabase:
- TST001: `delivery + own + coords válidas` → `eligible / awaiting_route` ✓
- TST002: `pickup` → `blocked / pickup_order` ✓
- TST003: Keeta `platform` → `external_monitoring` ✓
- TST004: segundo pedido elegível para pareamento pelo motor de rotas ✓

Banco validado:
- Store com coordenadas definidas (-23.5505, -46.6333)
- RLS `users_read_own_store` ativa
- Tabela `dispatch_alerts` criada com RLS

---

---

## ✅ Bloco 2 — Configurações da loja (reestruturação)

### Tarefas (tabs + remoção de Integrações separado)
**Status:** Concluídas

- Página Settings reconstruída com 3 abas: **Configurações Gerais**, **Conexões**, **Meu Plano**
- TabGeneral: formulário + mapa Leaflet (existente, migrado para dentro da aba)
- TabConnections: IntegrationCard absorvido do antigo `Integrations/index.tsx` — status iFood apenas aqui
- TabPlan: informações estáticas do plano atual
- Página `src/pages/Integrations/index.tsx` removida da navegação (App.tsx + Sidebar)
- `integrations` removido do tipo `Page` e de todos os guards

---

## ✅ Bloco 7 — Sons dos alertas (atualização)

### Tarefa: Sons mais longos e chamativos
**Status:** Concluída

Fallback Web Audio API reescrito em `src/lib/alertSound.ts`:
- `5min`: 6 pulsos em pares, duração ≈ 3.6s
- `1min`: 8 pulsos urgentes, duração ≈ 4.2s
- `critical`: 12 pulsos alternados intensos, duração ≈ 5.4s
- Envelope com attack/release correto (não bipes abruptos)

---

## ✅ Bloco 8 — Busca de endereço por CEP

### Tarefas
**Status:** Concluídas

- Criado `src/lib/cep.ts` com `fetchAddressByCep(cep)` via ViaCEP
- Aplicado no `OrderForm`: campo CEP com auto-preenchimento de rua, bairro, cidade; número fica em branco
- Aplicado em `Settings/TabGeneral`: campo CEP preenche automaticamente o campo de endereço
- Feedback visual: "Buscando..." durante a consulta, mensagem de erro inline em caso de CEP inválido

---

## ✅ Bloco 9 — Permissões por cadastro

### Tarefas
**Status:** Concluídas

- Migration `add_permissions_to_users`: coluna `permissions jsonb NOT NULL DEFAULT '{"operational":true,"orders":true,"drivers":true}'`
- Tipo `UserPermissions` adicionado em `src/types/index.ts`
- `EditModal` em `Users/index.tsx`: seção de permissões com checkboxes visível apenas para owner/admin
- `App.tsx`: carrega `permissions` junto com `role`, função `hasAccess()` guarda cada página
- `Sidebar.tsx`: botões de Painel Operacional, Pedidos e Motoristas ocultados conforme permissões do operador

---

## Resumo

════════════════════════════════════════
         EXECUÇÃO CONCLUÍDA
════════════════════════════════════════
✅ Concluídas: 64/64 (52 originais + 12 novos)
❌ Falhas:      0/64

Arquivos criados/modificados:
- .gitignore (raiz + hamburgueria-dispatch)
- src/App.tsx
- src/components/layout/Sidebar.tsx
- src/components/AlertSystem/index.tsx
- src/components/ClassifierService/index.tsx (novo)
- src/components/RouteEngineService/index.tsx (novo)
- src/lib/classifier.ts (novo)
- src/lib/routeEngine.ts (novo)
- src/lib/alertSound.ts (novo)
- src/lib/integrations/ifood.ts (novo)
- src/lib/integrations/openDelivery.ts (novo)
- src/pages/Settings/index.tsx (novo)
- src/pages/Settings/Settings.css (novo)
- .env (variáveis adicionadas)

Migrations Supabase:
- fix_users_rls_restrict_by_store
- remove_password_hash_column
- create_dispatch_alerts_table
════════════════════════════════════════
