# Classificador

## Resumo
Função pura que classifica os pedidos recebidos por elegibilidade de rota. Executa como assinante Realtime do Supabase em background. Determina se os pedidos devem entrar na fila de despacho, ser bloqueados ou aguardar.

## Fonte
- `hamburgueria-dispatch/src/lib/classifier.ts`
- `hamburgueria-dispatch/src/components/ClassifierService/index.tsx`
- `tasks_v1.md` — Bloco 3

## Como Funciona

### classifier.ts
Função pura — sem efeitos colaterais, sem chamadas ao banco:
```typescript
classifyOrder(order: Order): ClassificationResult {
  // Retorna { route_eligibility, route_block_reason, status }
}
```

### 5 Regras + Padrão

| Prioridade | Condição | Resultado |
|------------|----------|-----------|
| 1 | `delivery_type === 'pickup'` | `blocked / pickup_order` |
| 2 | `logistics_type === 'platform'` | `external_monitoring` |
| 3 | `latitude` ou `longitude` é null | `awaiting / missing_coordinates` |
| 4 | `address_street` vazio/null | `blocked / invalid_address` |
| 5 | `estimated_delivery_at > agora + 30min` | `awaiting / scheduled` |
| padrão | Nenhuma regra acionada | `eligible` → status `awaiting_route` |

### Componente ClassifierService
Componente em background montado na raiz do App. Sem UI visível.
- Assina INSERT Realtime do Supabase na tabela `orders`
- A cada novo pedido: chama `classifyOrder()` → UPDATE `route_eligibility`, `route_block_reason`, `status`

## Valores de route_eligibility
- `eligible` — entra na fila de despacho, status → `awaiting_route`
- `blocked` — nunca entrará na fila, motivo registrado
- `awaiting` — aguardando temporariamente, pode se tornar elegível depois
- `external_monitoring` — gerenciado pela logística da própria plataforma (ex: Keeta), exibido apenas no mapa

## Observações de Design
- Classificador é stateless e puro — fácil de testar unitariamente (embora testes não existam ainda)
- Pedidos da Keeta sempre caem em `external_monitoring` independente dos demais campos — ver [[Integração Open Delivery]]

## Notas Relacionadas
- [[Motor de Rotas]]
- [[Fluxo de Dados]]
- [[Schema do Banco de Dados]]
- [[Integração Open Delivery]]
