# Open Delivery Integration

## Summary
Integration with platforms that follow the Open Delivery standard: 99Food, Keeta, and Cardápio Web. Library exists (`openDelivery.ts`) but UI is hidden. Keeta orders are special — they always use platform logistics and never enter the dispatch queue.

## Source
- `hamburgueria-dispatch/src/lib/integrations/openDelivery.ts`
- `tasks_v1.md` — Bloco 6
- `task-log.md`

## Status
**In development — UI hidden.**
- `openDelivery.ts` exists with full implementation
- Settings/Connections tab shows iFood only (others disabled in UI)
- Env vars defined but optional

## Supported Platforms

| Platform | Protocol | Logistics | Queue Behavior |
|----------|----------|-----------|----------------|
| 99Food | Open Delivery | Own (configurable) | Enters dispatch queue |
| Keeta | Open Delivery | **Platform only** | `external_monitoring` always |
| Cardápio Web | Open Delivery + webhook | Own | Enters dispatch queue |

## Keeta Special Rule
Keeta always uses its own delivery staff.
- Classifier: if `platform = 'keeta'` → `logistics_type = 'platform'` → `route_eligibility = 'external_monitoring'`
- These orders appear on map for visibility but never enter the dispatch queue
- This rule is enforced regardless of other order fields

## openDelivery.ts — Key Features
- OAuth 2.0 authentication per platform (one client per platform)
- Token cache + auto-renewal
- Order normalization from Open Delivery format → internal `Order` type
- Platform dispatch confirmation (called when suggestion accepted)
- Webhook handler: `src/api/webhook/openDelivery.ts` — validates signature, identifies source platform

## Required Env Vars (when activating)
```
VITE_99FOOD_CLIENT_ID / VITE_99FOOD_CLIENT_SECRET
VITE_KEETA_CLIENT_ID / VITE_KEETA_CLIENT_SECRET
VITE_CARDAPIOWEB_CLIENT_ID / VITE_CARDAPIOWEB_CLIENT_SECRET
VITE_CARDAPIOWEB_WEBHOOK_SECRET
```

## Error Handling
- HTTP 5xx or timeout: retry up to 3 times with exponential backoff (same pattern as iFood)
- 4xx errors: do not retry

## Related Notes
- [[iFood Integration]]
- [[Classifier]]
- [[Database Schema]]
