# Classifier

## Summary
Pure function that classifies incoming orders by route eligibility. Runs as a background Supabase Realtime subscriber. Determines whether orders should enter the dispatch queue, be blocked, or wait.

## Source
- `hamburgueria-dispatch/src/lib/classifier.ts`
- `hamburgueria-dispatch/src/components/ClassifierService/index.tsx`
- `tasks_v1.md` — Bloco 3

## How It Works

### classifier.ts
Pure function — no side effects, no DB calls:
```typescript
classifyOrder(order: Order): ClassificationResult {
  // Returns { route_eligibility, route_block_reason, status }
}
```

### 5 Rules + Default

| Priority | Condition | Result |
|----------|-----------|--------|
| 1 | `delivery_type === 'pickup'` | `blocked / pickup_order` |
| 2 | `logistics_type === 'platform'` | `external_monitoring` |
| 3 | `latitude` or `longitude` is null | `awaiting / missing_coordinates` |
| 4 | `address_street` is empty/null | `blocked / invalid_address` |
| 5 | `estimated_delivery_at > now + 30min` | `awaiting / scheduled` |
| default | None matched | `eligible` → status `awaiting_route` |

### ClassifierService Component
Background component mounted in App root. No visible UI.
- Subscribes to Supabase Realtime INSERT on `orders` table
- On new order: calls `classifyOrder()` → UPDATE `route_eligibility`, `route_block_reason`, `status`

## Route Eligibility Values
- `eligible` — enters dispatch queue, status → `awaiting_route`
- `blocked` — will never enter queue, reason logged
- `awaiting` — temporarily holding, can become eligible later
- `external_monitoring` — handled by platform's own logistics (e.g. Keeta), shown on map only

## Design Notes
- Classifier is stateless and pure — easy to unit test (though tests don't exist yet)
- Keeta orders always land in `external_monitoring` regardless of other fields — see Open Delivery integration

## Related Notes
- [[Route Engine]]
- [[Data Flow]]
- [[Database Schema]]
- [[Open Delivery Integration]]
