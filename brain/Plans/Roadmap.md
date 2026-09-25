# Roadmap

## Resumo
> **Atualização set/2026:** as seções v2 abaixo estão parcialmente desatualizadas (service key já saiu do front, testes já existem, IfoodPoller já reage ao toggle). O plano vigente é [[Roadmap de Estabilização]].

Plano de execução do Hamburgueria Dispatch. v1 entregue e concluída. Prioridades da v2 baseadas nas dívidas técnicas e funcionalidades faltantes conhecidas.

## Fonte
- `tasks_v1.md` — definição do escopo da v1
- `task-log.md` — registro de conclusão da v1
- `.planning/codebase/CONCERNS.md` — problemas a endereçar

---

## ✅ v1 — CONCLUÍDA (64/64 tarefas)

### Entregue
- Segurança base (gitignore, RLS, listener de sessão, remoção de password_hash)
- Página de configurações da loja com mapa Leaflet + preenchimento por CEP
- Classificador logístico (5 regras + padrão) com serviço Realtime em background
- Motor de rotas (otimização de par + fallback de pedido único + contagem de rejeições)
- Integração iFood (OAuth2, polling, Edge Function, gestão de credenciais)
- Biblioteca Open Delivery (99Food, Keeta)
- Sistema de alertas (3 níveis, áudio via Web Audio API)
- Preenchimento por CEP no OrderForm + Configurações
- Gestão de usuários com papel + permissões granulares por página
- Página de Configurações reestruturada com 3 abas (Configurações Gerais, Conexões, Meu Plano)

---

## 🔴 v2 — Correções de Segurança (Alta Prioridade)

### Fase 1: Hardening de Segurança
**Objetivos:**
- Remover `VITE_SUPABASE_SERVICE_KEY` do frontend
- Criptografar credenciais em repouso
- Fortalecer operações admin

**Entregas:**
- [ ] Supabase Edge Function para criar/atualizar/deletar usuários
- [ ] Remover `supabaseAdmin` do frontend
- [ ] Criptografar `client_secret` em `store_integrations` usando Supabase Vault ou pgcrypto
- [ ] Adicionar validação na inicialização para chaves ausentes

**Riscos:**
- Mudança que quebra o fluxo de gestão de usuários
- Necessidade de testar permissões da Edge Function cuidadosamente

---

### Fase 2: Correção de Bugs Críticos
**Objetivos:**
- Corrigir os 4 bugs de média prioridade

**Entregas:**
- [ ] IfoodPoller: assinar mudanças Realtime em `store_integrations`
- [ ] AlertSound: instância única de AudioContext no nível do módulo
- [ ] Sugestão de despacho: JOIN no banco (RPC ou view) para busca em query única
- [ ] Modal de pedido: correção do timing da transição CSS

---

### Fase 3: Base para Desenvolvimento
**Objetivos:**
- Adicionar suite de testes inicial
- Centralizar constantes compartilhadas

**Entregas:**
- [ ] Adicionar Vitest + configurar runner de testes
- [ ] Testes unitários do Classificador (cobertura das 5 regras)
- [ ] Testes unitários do Motor de Rotas
- [ ] `src/lib/platformConfig.ts` — centralizar cores das plataformas
- [ ] Hook `useStoreId()` — eliminar buscas repetidas de store_id

---

## 🟡 v3 — Ativação do Open Delivery

### Fase 4: Ativar Integrações de Plataformas
**Objetivos:**
- Habilitar 99Food e Keeta em produção
- Mostrar cards de integração em Configurações → Conexões

**Entregas:**
- [ ] UI para credenciais + toggle do 99Food
- [ ] UI para credenciais + toggle da Keeta
- [ ] Testes com credenciais reais das plataformas

---

## 🟢 v4 — Estabilidade e Escala

### Fase 5: Performance
- Paginação na lista de Pedidos
- Atualizações Realtime incrementais (sem mais fetchAll)
- Enriquecimento de sugestões em query única
- Animações ghost do mapa via CSS

### Fase 6: Funcionalidades Faltantes
- Suporte offline com cache SQLite local
- Histórico de pedidos / trilha de auditoria
- Notificações push desktop
- Aceitar/recusar em lote

---

## Notas Relacionadas
- [[Registro de Pendências]]
- [[Visão Geral do Projeto]]
- [[Registro de Decisões]]
