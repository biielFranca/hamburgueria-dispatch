# Cardápio Web — API Aberta

> Deprecated historical note. Cardápio Web support was removed from the current app; this file is kept only as archived implementation history.

## Summary
Cardápio Web expõe **duas APIs independentes**:

1. **Open Delivery** — padrão ABRASEL, OAuth2 client_credentials, events-based polling + ACK. Integração atual via `open-delivery-*` edge functions. Hoje retorna **0 eventos** para a loja testada — Cardápio Web provavelmente não publica todos os pedidos nesse canal.
2. **API Aberta (native)** — API REST proprietária, auth por header `X-API-KEY` (token fixo por estabelecimento), inclui webhooks e polling próprios. **Onde os pedidos reais trafegam** (iFood incluído). Esta é a integração nova que precisamos construir.

## Source
- https://cardapioweb.stoplight.io/docs/api/gr82prcl4v2jr-introducao (Stoplight project `cHJqOjIwNjg0MQ`, branch `main`)
- Nós lidos via `https://cardapioweb.stoplight.io/api/v1/projects/cHJqOjIwNjg0MQ/nodes/{slug}` em 2026-04-21.
- Evidência operacional: logs da `open-delivery-sync` retornam 0 eventos mesmo com pedidos reais recebidos pela loja.

## Ambientes
| Ambiente | URL |
|----------|-----|
| Sandbox | `https://integracao.sandbox.cardapioweb.com` |
| Produção | `https://integracao.cardapioweb.com` |

Token fixo de teste (Sandbox): `7nSyGq49NVXuyZfgEQNPg3TdUqLNXTMNMNJwckvE`.
Loja real de produção (biel): `código_loja=19856`, token gerenciado via Portal → Configurações → Integrações → API.
Mapeamento interno: `código_loja=19856 → store_id=f5177424-1d0f-40b6-bf91-f6b76aac58e1`.

## Autenticação
- Header obrigatório: `X-API-KEY: <token_do_estabelecimento>`
- Alguns endpoints (catálogo cross-tenant) pedem também `X-PARTNER-KEY`.
- Token identifica o estabelecimento — não precisamos mandar `storeId` separado.
- Resposta 401 `{code:4010, message:"Token inválido"}` se faltar.

## Rate limits
- 400 req/min por estabelecimento (geral).
- 5 req/min para consultar catálogo, consultar loja, histórico de pedidos.
- 100 req/min para demais endpoints de catálogo.
- 429 quando excedido.

## Módulos e endpoints

### API Pedidos (único que Dispatch precisa hoje)

| Método | Path | Summary |
|--------|------|---------|
| GET | `/api/partner/v1/orders` | Polling de pedidos (até 8h, `updated_since`, `status[]`) |
| GET | `/api/partner/v1/orders/history` | Histórico (rate limit 5/min) |
| GET | `/api/partner/v1/orders/{order_id}` | Detalhes completos |
| POST | `/api/partner/v1/orders/{order_id}/confirm` | Aceitar → `confirmed` ou `scheduled_confirmed` (204) |
| POST | `/api/partner/v1/orders/{order_id}/start_preparation` | Iniciar preparação (agendamento) |
| POST | `/api/partner/v1/orders/{order_id}/ready` | Pedido pronto |
| POST | `/api/partner/v1/orders/{order_id}/delivered` | Pedido entregue |
| POST | `/api/partner/v1/orders/{order_id}/finalize` | Finalizar pedido |
| POST | `/api/partner/v1/orders/{order_id}/cancel` | Cancelar pedido |

### API Loja e API Catálogo
Não integradas agora — ver `reference/API-Loja.json` e `reference/API-Catalogo.json` no Stoplight quando precisar.

## Webhooks

### Cadastro
Portal → Configurações → Integrações → API → **Adicionar webhook**. Só aparece depois de gerar o token.
Campos: URL + token opcional (enviado no header `X-Webhook-Token`) + ativo.

### Handshake
- Cardápio Web faz `POST <url>` com JSON do evento.
- **Timeout 5s**. Resposta DEVE ser `200 OK` — qualquer outro status = falha.
- Retries: 15s, 30s, 60s, 120s, 300s, 600s, 900s, 900s, … até 15 tentativas → webhook pausado.

### Estrutura do payload
```json
{
  "event_id": "067c677bf1c096ad7db136dc",
  "event_type": "ORDER_CREATED | ORDER_STATUS_UPDATED",
  "merchant_id": 3268,
  "order_id": 237456,
  "order_status": "waiting_confirmation",
  "created_at": "2023-06-22T19:04:20.292-03:00"
}
```

- `ORDER_CREATED` — novo pedido chegou.
- `ORDER_STATUS_UPDATED` — pedido mudou de status.
- Mesas/comandas só geram `ORDER_CREATED` quando canceladas/finalizadas.
- Payload **só traz metadata** — precisamos buscar detalhes via `GET /orders/{id}`.

## Estrutura `Pedido` (campos relevantes p/ Dispatch)

Top-level: `id`, `display_id`, `external_display_id`, `external_order_id`, `merchant_id`, `status`, `order_type` (delivery/takeout/onsite/closed_table), `order_timing` (immediate/scheduled), `sales_channel`, `customer_origin`, `delivered_by`, `table_number`, `estimated_time`, `cancellation_reason`, `fiscal_document`, `observation`, `delivery_fee`, `service_fee`, `additional_fee`, `total`, `customer`, `delivery_address`, `items`, `payments`, `schedule`, `discounts`, `created_at`, `updated_at`.

### `sales_channel`
Canal de origem do pedido no Cardápio Web:
- `catalog` — cardápio digital padrão (delivery e retirada)
- `store_front_catalog` — cardápio de balcão (só retirada)
- `portal` — portal de gestão (operador criou manual)
- `whatsapp_extension` — extensão Chrome do WhatsApp
- `ifood` — **pedido recebido via integração iFood do próprio Cardápio Web**

### `delivered_by` (responsável pela entrega)
- `merchant`, `ifood`, `ifood_shipping`, `foody_delivery`, `food99`, `keeta`, `aiqfome`
- `null` quando `order_type != delivery`

### `payments[].payment_method`
money, credit_card, debit_card, pix, pix_auto, meal_voucher, food_voucher, bank_transfer, bank_slip, picpay, debt_book, online_credit_card, ifood, ifood_voucher, food99, food99_voucher.

## Mapping → tabela `orders`

- `platform_order_id` ← `pedido.id.toString()`
- `platform_order_code` ← `pedido.display_id` (ou `external_display_id` para iFood)
- `platform` ← `'cardapio_web'` (mesmo valor já usado pela integração Open Delivery — identificamos pelo canal real em `source_channel`)
- `source_channel` ← Derivado (ver regra abaixo)
- `customer_name/phone` ← `pedido.customer.name/phone`
- `address_*` ← `pedido.delivery_address.*`
- `items` ← `pedido.items` normalizado
- `total_amount` ← `pedido.total`
- `payment_method` ← `pedido.payments[0].payment_method`
- `delivery_type` ← `pedido.order_type === 'delivery' ? 'delivery' : 'pickup'`
- `logistics_type` ← regra abaixo
- `status` ← `'awaiting_route'` se (delivery + logistica própria), senão `'normalized'`

### Regra `source_channel`
```
if sales_channel === 'ifood' ⇒ 'IFOOD'
else if sales_channel in {catalog, store_front_catalog, portal, whatsapp_extension} ⇒ 'CARDAPIO_WEB_OWN'
else ⇒ sales_channel.toUpperCase()
```

### Regra `logistics_type`
```
if delivered_by in {merchant, foody_delivery, null} ⇒ 'own'
else ⇒ 'platform'   // ifood, ifood_shipping, food99, keeta, aiqfome entregam sozinhos
```

## Diferenças vs Open Delivery
| | Open Delivery | API Aberta |
|--|---|---|
| Auth | OAuth2 client_credentials | Header fixo `X-API-KEY` |
| Discovery | `GET /events/v1.0/events:polling` + `ack` | Webhook `POST` + `GET /orders` |
| Payload webhook | Eventos ABRASEL (array com `.id/.code`) | `{event_id, event_type, merchant_id, order_id, order_status, created_at}` |
| Confirmar dispatch | `POST /orders/{id}/dispatch` (Open Delivery extension) | `POST /orders/{id}/ready` / `/delivered` / etc. |
| Dados completos | `GET /orders/{id}` | `GET /api/partner/v1/orders/{order_id}` |

## Decisions
- Reusar `platform='cardapio_web'` em `store_integrations` (é a mesma plataforma física). Credenciais da API Aberta vão em colunas novas (`api_aberta_token`, `api_aberta_merchant_id`).
- Criar edge functions separadas (`cardapio-web-native-webhook`, `cardapio-web-native-poll`) — não misturar com `openDelivery.ts`.
- Não tocar no webhook existente para `acesso.pickngo.online` no portal do Cardápio Web — apenas adicionar um webhook novo apontando pro Dispatch.

## Next Steps
1. Migração DDL: adicionar `api_aberta_token text` (encrypted) + `api_aberta_merchant_id integer` em `store_integrations`.
2. Seed: registro para `store_id=f5177424-1d0f-40b6-bf91-f6b76aac58e1`, `merchant_id=19856`, token do portal (a pegar com o usuário).
3. Edge function `cardapio-web-native-webhook` (validar `X-Webhook-Token`, buscar detalhes via GET, upsert `orders`).
4. Edge function `cardapio-web-native-poll` (fallback — chama `GET /orders?updated_since=…` a cada 30s via cron).
5. Pedir ao usuário: cadastrar novo webhook no portal apontando para a Edge Function.

## Related Notes
- [[Open Delivery Integration]]
- [[iFood Integration]]
- [[Data Flow]]
- [[Database Schema]]
