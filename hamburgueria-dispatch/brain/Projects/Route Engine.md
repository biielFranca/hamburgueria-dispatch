# Motor de Rotas

## Resumo
Pareia automaticamente pedidos elegíveis e gera sugestões de rota de despacho otimizadas. Compara as duas sequências de entrega para encontrar a mais rápida, depois cria uma `dispatch_suggestion` para o operador revisar.

## Fonte
- `hamburgueria-dispatch/src/lib/routeEngine.ts`
- `hamburgueria-dispatch/src/components/RouteEngineService/index.tsx`
- `tasks_v1.md` — Bloco 4

## Como Funciona

### runRouteEngine(storeId: string)
Função coordenadora principal em `routeEngine.ts`:

1. **Busca pedidos elegíveis**: SELECT orders WHERE `route_eligibility = 'eligible'` E `status = 'awaiting_route'` E `store_id = ?`, ordenados por `rejection_count DESC`, `created_at ASC`
2. **Consulta API de rotas**: dado origem da loja + 2 destinos dos pedidos, retorna tempo de viagem + distância (perfil de moto)
3. **Compara sequências**: calcula tempo de A→B e B→A, escolhe o menor
4. **Cria sugestão**: INSERT em `dispatch_suggestions` + `dispatch_suggestion_orders` com `status = 'pending_review'`

### Lógica de Pedido Único
Se existe apenas 1 pedido elegível e ele está esperando há mais de 10 minutos: cria sugestão de pedido único em vez de aguardar um par.

### Tratamento de Rejeições
- Cada rejeição incrementa `rejection_count` no pedido
- Após 3 rejeições sem pareamento: marca como `dispatch_timeout` e exibe alerta no painel

### Componente RouteEngineService
Componente em background. Assina Realtime do Supabase na tabela `orders`.
Dispara `runRouteEngine(storeId)` sempre que um pedido é atualizado para `status = 'awaiting_route'`.

## API de Rotas Externa
- Configurada via env vars: `VITE_ROUTES_API_KEY` e `VITE_ROUTES_API_URL`
- Recomendado: Mapbox ou Google Maps
- Perfil: moto (otimiza para tempo de entrega)
- Retorna: tempo de viagem (segundos) + distância (metros) por segmento

## Priorização dos Pedidos
1. `rejection_count DESC` — pedidos mais rejeitados são pareados primeiro
2. `created_at ASC` — mais antigos primeiro dentro do mesmo nível de rejeição

## Notas Relacionadas
- [[Classificador]]
- [[Fluxo de Dados]]
- [[Schema do Banco de Dados]]
- [[Arquitetura do Sistema]]
