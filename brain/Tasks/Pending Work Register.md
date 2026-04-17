# Registro de Pendências

## Resumo
Bugs conhecidos, problemas de segurança, gargalos de performance, funcionalidades faltantes e dívidas técnicas do Hamburgueria Dispatch v1. Todas as 64 tarefas da v1 foram concluídas. Este registro acompanha o que vem a seguir.

## Fonte
- `.planning/codebase/CONCERNS.md`
- `tasks_v1.md`
- `task-log.md`

---

## 🔴 Alta Prioridade — Segurança

- [ ] **Remover VITE_SUPABASE_SERVICE_KEY do frontend** — mover todas as operações admin de usuários para uma Supabase Edge Function. Este é o risco de segurança nº 1.
- [ ] **Criptografar credenciais das plataformas em repouso** — `store_integrations.client_secret` está em texto plano no banco. Usar Supabase Vault ou criptografar antes de armazenar.
- [ ] **Validar service key na inicialização** — atualmente operações admin falham silenciosamente se `VITE_SUPABASE_SERVICE_KEY` estiver ausente. Adicionar verificação na inicialização + desabilitar UI admin de forma elegante.

---

## 🟡 Média Prioridade — Bugs

- [ ] **IfoodPoller ignora toggle de integração** — ativar/desativar em Configurações → Conexões exige reload da página. O IfoodPoller lê o status `active` apenas no mount. Correção: assinar mudanças Realtime em `store_integrations`.
- [ ] **Múltiplas instâncias de AudioContext nos alertas** — alertas rápidos criam múltiplos AudioContext, causando erros no browser. Correção: instância única de AudioContext no nível do módulo.
- [ ] **Race condition no enriquecimento de sugestões** — blocos de sugestão às vezes mostram lista de pedidos vazia em redes lentas. Correção: JOIN no banco para buscar sugestões com pedidos em query única.
- [ ] **Flickering na animação de fechar modal de pedido** — conteúdo pisca durante a transição de fechamento. Correção: alinhar duração da transição CSS com o delay do setTimeout (250ms).

---

## 🟡 Média Prioridade — Dívida Técnica

- [ ] **Centralizar cores das plataformas** — mapa `platformColors` duplicado em 3 arquivos (`Orders`, `Operational`, `AlertSystem`). Criar `src/lib/platformConfig.ts`.
- [ ] **Hook useStoreId()** — cada componente busca `store_id` independentemente no mount (7+ componentes). Criar hook customizado ou React Context para buscar e cachear uma única vez.
- [ ] **Adicionar React Error Boundaries** — sem error boundaries no app. Um crash em qualquer componente desmonta o app inteiro.
- [ ] **Substituir IDs com Date.now() + Math.random()** — `OrderForm` usa IDs não-criptográficos. Substituir por `crypto.randomUUID()`.
- [ ] **Null checks no mapa operacional** — `latitude`/`longitude` dos pedidos não são verificados como null em alguns renders. Adicionar optional chaining em todo o código.
- [ ] **Esquema de e-mail real para auth** — `username@dispatch.internal` impede recuperação de senha por e-mail. Migrar para e-mails reais + fluxo de reset adequado.

---

## 🟡 Média Prioridade — Performance

- [ ] **Rebusca completa em qualquer evento Realtime** — página Operacional chama `fetchAll()` em qualquer evento `postgres_changes`. Migrar para atualizações incrementais.
- [ ] **Paginação na lista de Pedidos** — todos os pedidos carregados sem limite. Adicionar paginação por cursor para lojas com muitos pedidos.
- [ ] **Cache por pedido no AlertSystem** — atualmente reconstrói o estado de alertas do zero a cada 20s. Rastrear timestamps por pedido, consultar apenas pedidos novos.
- [ ] **Otimização de tick no OperationalMap** — mapa `markerStates` recomputado a cada segundo para o efeito ghost. Substituir por animação de opacidade CSS.
- [ ] **Sugestões com pedidos em query única** — atualmente busca em duas etapas. Adicionar view/RPC no banco fazendo JOIN de `dispatch_suggestions` com `dispatch_suggestion_orders` + `orders`.

---

## 🟢 Baixa Prioridade — Funcionalidades Faltantes

- [ ] **Ativar integrações Open Delivery** — 99Food, Keeta, Cardápio Web. Biblioteca existe (`openDelivery.ts`). Exibir UI em Configurações → Conexões.
- [ ] **Suporte offline** — app falha completamente sem conexão com Supabase. Adicionar cache local SQLite + fila de sincronização.
- [ ] **Histórico de pedidos / trilha de auditoria** — sem registro de transições de status ou motivos de recusa. Adicionar tabela `order_events`.
- [ ] **Rastreamento GPS do motoboy** — sem localização do motoboy em tempo real no mapa. Exigiria app mobile companion ou API de geolocalização.
- [ ] **Notificações push / desktop** — operadores precisam ficar olhando a tela constantemente. Adicionar API de notificações desktop do Tauri para novas sugestões e pedidos atrasados.
- [ ] **Operações em lote** — só é possível aceitar/recusar uma sugestão por vez. Adicionar gestão em massa.
- [ ] **Sincronização de sessão entre abas** — logout em uma aba não é propagado. Implementar `BroadcastChannel` API.

---

## 🔵 Lacunas de Cobertura de Testes

- [ ] **Zero testes automatizados** — nenhum framework de testes configurado. Alto risco para toda a lógica central.
- [ ] **Testes unitários do Classificador** — função pura, fácil de testar. Adicionar testes Vitest para as 5 regras.
- [ ] **Testes unitários do Motor de Rotas** — testar lógica de comparação de sequências, fallback de pedido único, lógica de timeout.
- [ ] **Testes do fluxo de autenticação** — mapeamento de login, expiração de sessão, tratamento de service key ausente.
- [ ] **Comportamento de reconexão Realtime** — o que acontece quando a assinatura Supabase cai silenciosamente?
- [ ] **Edge cases de deduplicação de alertas** — criação/remoção rápida de pedidos, mudanças de status no meio de um alerta.

---

## Lacunas Estruturais

- Sem pipeline CI/CD — builds manuais locais apenas
- Sem serviço de rastreamento de erros (Sentry etc.)
- Sem logging estruturado — apenas `console.log`

## Notas Relacionadas
- [[Registro de Decisões]]
- [[Roadmap]]
- [[Arquitetura do Sistema]]
- [[Sistema de Autenticação]]
- [[Integração iFood]]
