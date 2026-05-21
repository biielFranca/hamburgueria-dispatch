# Glossário

## Resumo
Terminologia específica do projeto Hamburgueria Dispatch.

## Fonte
- `hamburgueria-dispatch/src/types/index.ts`
- `tasks_v1.md`

## Termos do Domínio

### dispatch_suggestion
Sugestão de rota gerada pelo Motor de Rotas. Contém 1–2 pedidos pareados de forma ótima, com sequência de entrega sugerida. O operador a revisa, seleciona um motoboy e aceita ou recusa.

### route_eligibility
Classificação da elegibilidade de um pedido para entrar na fila de despacho. Valores: `eligible`, `blocked`, `awaiting`, `external_monitoring`. Definida pelo Classificador.

### route_block_reason
Motivo pelo qual um pedido foi bloqueado ou está aguardando. Valores: `pickup_order`, `missing_coordinates`, `invalid_address`, `scheduled`.

### ClassifierService
Componente React em background que assina inserções de novos pedidos via Supabase Realtime e executa `classifyOrder()` em cada um.

### RouteEngineService
Componente React em background que dispara `runRouteEngine()` quando pedidos se tornam elegíveis.

### IfoodPoller
Componente React em background que consulta o iFood via Supabase Edge Function a cada 30 segundos.

### AlertSystem
Componente React em background que consulta pedidos ativos a cada 20 segundos e dispara alertas por tempo.

### dispatch_ghost
Efeito visual no mapa operacional: pedidos despachados somem gradualmente em 60 segundos. Rastreado via array `inProgress` no estado da página Operacional.

### store_id
UUID que identifica a loja/restaurante. Usado para RLS — cada recurso é escopado a uma loja.

### @dispatch.internal
Domínio de e-mail sintético. Todos os e-mails de auth seguem o padrão `{username}@dispatch.internal`, pois o Supabase Auth exige formato de e-mail mas os operadores não têm e-mails pessoais.

### supabaseAdmin
Cliente Supabase inicializado com a service role key. Usado para operações admin de usuários. Exige `VITE_SUPABASE_SERVICE_KEY`.

### external_monitoring
Estado de elegibilidade de rota para pedidos com logística da plataforma (ex: Keeta). Esses pedidos aparecem no mapa de despacho mas nunca entram na fila, pois a plataforma gerencia a entrega.

### rejection_count
Contador na tabela `orders`. Incrementa cada vez que uma sugestão de despacho contendo esse pedido é recusada. Após 3 rejeições, o pedido é marcado como `dispatch_timeout`.

### Open Delivery
Padrão brasileiro de API para delivery de comida. Usado por 99Food e Keeta no Hamburgueria Dispatch.

## Convenções de Nomenclatura

### Arquivos
- Páginas: `src/pages/NomeDaPagina/index.tsx` + `NomeDaPagina.css`
- Componentes: `src/components/NomeDoComponente/index.tsx`
- Lib: `src/lib/nomeDaFuncionalidade.ts`
- Integrações: `src/lib/integrations/nomeDaPlataforma.ts`

### Variáveis
- camelCase para todos os identificadores TypeScript
- SCREAMING_SNAKE_CASE para constantes (SESSION_DURATION, DISPATCH_GHOST_MS)
- Colunas do banco: snake_case

### Branches / Commits
- Sem convenção formal observada no código

## Notas Relacionadas
- [[Schema do Banco de Dados]]
- [[Arquitetura do Sistema]]
- [[Visão Geral do Projeto]]
