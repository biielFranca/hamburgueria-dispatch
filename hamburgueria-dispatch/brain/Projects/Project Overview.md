# Visão Geral do Projeto

## Resumo
Hamburgueria Dispatch é um aplicativo desktop Windows para gerenciamento de despacho de delivery. Recebe pedidos de plataformas (iFood, 99Food, Keeta, Cardápio Web), classifica-os logisticamente, agrupa em rotas ótimas e despacha motoboys.

## Fonte
- `hamburgueria-dispatch/` — código principal
- `tasks_v1.md` — definição das tarefas da v1
- `task-log.md` — histórico de execução
- `.planning/codebase/ARCHITECTURE.md`

## Objetivo
Eliminar o despacho manual em hamburguerias e restaurantes com delivery próprio. O app centraliza recebimento de pedidos, otimização de rotas e atribuição de motoboys em um painel desktop para operadores.

## Escopo Atual

### Implementado (v1 — 64/64 tarefas concluídas)
- Ingestão de pedidos multi-plataforma (iFood ativo, demais em desenvolvimento)
- Classificador logístico com 5 regras + padrão (eligible/blocked/awaiting/external_monitoring)
- Motor de rotas: pareia 2 pedidos de forma ótima via API de rotas externa, cria sugestões de despacho
- Painel operacional: visualização no mapa, atribuição de motoboy, aceitar/recusar sugestões
- Sistema de alertas: avisos por tempo (5min, 1min, atrasado) com áudio
- Página de configurações: dados da loja com mapa Leaflet e preenchimento por CEP
- Gestão de usuários com controle de acesso por papel (owner/admin/operator) + permissões por página
- Integração iFood com cache de token OAuth e polling a cada 30s
- Preenchimento automático de endereço por CEP no formulário de pedido e nas configurações

### Fora do escopo (v1)
- Suporte offline
- Rastreamento GPS do motoboy
- Notificações push/desktop
- Histórico de pedidos / trilha de auditoria
- Operações em lote (aceitar/recusar múltiplos)

## Módulos Principais
- **Classificador** (`src/lib/classifier.ts` + `src/components/ClassifierService/`) — classifica pedidos recebidos
- **Motor de Rotas** (`src/lib/routeEngine.ts` + `src/components/RouteEngineService/`) — gera sugestões de despacho
- **Sistema de Alertas** (`src/components/AlertSystem/`) — alertas por tempo com áudio
- **Integração iFood** (`src/lib/integrations/ifood.ts` + `src/components/IfoodPoller/`) — sincronização de pedidos
- **Open Delivery** (`src/lib/integrations/openDelivery.ts`) — 99Food, Keeta, Cardápio Web (parcial)
- **Operacional** (`src/pages/Operational/`) — painel principal com mapa
- **Pedidos** (`src/pages/Orders/`) — lista de pedidos com atualizações em tempo real
- **Configurações** (`src/pages/Settings/`) — 3 abas: Configurações Gerais, Conexões, Meu Plano

## Fluxos Importantes
1. Ingestão: webhook da plataforma → Edge Function Supabase → tabela `orders` → Classificador → `awaiting_route`
2. Sugestão de rota: Motor de Rotas busca pedidos `eligible` → pareia → insere `dispatch_suggestion`
3. Despacho: operador aceita sugestão + escolhe motoboy → status `dispatched`
4. Alertas: AlertSystem consulta pedidos a cada 20s → dispara áudio + alerta visual por idade

## Estado Atual
v1 entregue e funcional. Sem testes automatizados. Problemas de segurança conhecidos (service key no frontend, credenciais em texto plano). Melhorias de performance planejadas.

## Áreas Incompletas Conhecidas
- Integrações Open Delivery (99Food, Keeta, Cardápio Web) — UI oculta, lib existe
- Suporte offline — não iniciado
- Suite de testes automatizados — não iniciada
- Rastreamento de motoboy — não iniciado
- Histórico de pedidos / trilha de auditoria — não iniciado

## Notas Relacionadas
- [[Arquitetura do Sistema]]
- [[Registro de Decisões]]
- [[Registro de Pendências]]
- [[Roadmap]]
