# Integração Open Delivery

## Resumo
Integração com plataformas que seguem o padrão Open Delivery: 99Food e Keeta. Pedidos da Keeta são especiais — sempre usam logística da plataforma e nunca entram na fila de despacho.

## Fonte
- `hamburgueria-dispatch/src/lib/integrations/openDelivery.ts`
- `tasks_v1.md` — Bloco 6
- `task-log.md`

## Status
**Em desenvolvimento — UI oculta.**
- `openDelivery.ts` existe com implementação completa
- Aba Configurações/Conexões exibe apenas iFood (demais desabilitados na UI)
- Variáveis de ambiente definidas mas opcionais

## Plataformas Suportadas

| Plataforma | Protocolo | Logística | Comportamento na Fila |
|------------|-----------|-----------|----------------------|
| 99Food | Open Delivery | Própria (configurável) | Entra na fila de despacho |
| Keeta | Open Delivery | **Apenas da plataforma** | `external_monitoring` sempre |

## Regra Especial da Keeta
A Keeta sempre usa seus próprios entregadores.
- Classificador: se `platform = 'keeta'` → `logistics_type = 'platform'` → `route_eligibility = 'external_monitoring'`
- Esses pedidos aparecem no mapa para visibilidade mas nunca entram na fila de despacho
- Esta regra é aplicada independente dos outros campos do pedido

## openDelivery.ts — Funcionalidades Principais
- Autenticação OAuth 2.0 por plataforma (um cliente por plataforma)
- Cache de token + renovação automática
- Normalização de payload Open Delivery → tipo interno `Order`
- Confirmação de despacho pela plataforma (chamada quando sugestão é aceita)
- Handler de webhook: `src/api/webhook/openDelivery.ts` — valida assinatura, identifica plataforma de origem

## Variáveis de Ambiente Necessárias (ao ativar)
```
VITE_99FOOD_CLIENT_ID / VITE_99FOOD_CLIENT_SECRET
VITE_KEETA_CLIENT_ID / VITE_KEETA_CLIENT_SECRET
```

## Tratamento de Erros
- HTTP 5xx ou timeout: até 3 tentativas com backoff exponencial (mesmo padrão do iFood)
- Erros 4xx: não tentar novamente

## Notas Relacionadas
- [[Integração iFood]]
- [[Classificador]]
- [[Schema do Banco de Dados]]
