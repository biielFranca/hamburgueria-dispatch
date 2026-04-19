# Order State Machine

## Summary
Valid states, transitions, actors and side-effects for the order lifecycle.

---

## States

| State | Meaning |
|-------|---------|
| `received` | Order arrived from external platform; not yet normalised |
| `normalized` | Fields mapped to internal schema; awaiting classification |
| `awaiting_route` | Classified as eligible; waiting for RouteEngine to pick it up |
| `in_suggestion` | Included in a pending_review dispatch_suggestion |
| `dispatched` | Operator confirmed dispatch; driver assigned |
| `delivered` | Order delivered (manual or platform confirmation) |
| `cancelled` | Cancelled by platform, operator or customer |
| `dispatch_timeout` | Reached MAX_REJECTIONS without dispatch |
| `external_monitoring` | Platform-managed logistics (e.g. Keeta); no route needed |

---

## Transitions

| From | To | Trigger | Actor | Side-effects | Idempotency key |
|------|----|---------|-------|--------------|----------------|
| — | `received` | Webhook / iFood sync insert | Platform | INSERT order_events(received) | `platform + platform_order_id` |
| `received` | `normalized` | Normalisation step in ingestion fn | System | INSERT order_events(normalized) | — |
| `normalized` | `awaiting_route` | Classifier: eligible order | System (`classify-orders`) | UPDATE route_eligibility=eligible; INSERT order_events(classified) | order.id + round |
| `normalized` | `normalized` (stay) | Classifier: missing coords → geocode attempted | System | UPDATE lat/lng; INSERT order_events(classified) | — |
| `normalized` | `normalized` (stay) | Classifier: geocode failed | System | route_eligibility=awaiting; reason=missing_coordinates | — |
| `normalized` | `normalized` (stay) | Classifier: blocked | System | route_eligibility=blocked; reason=pickup/invalid_address | — |
| `normalized` | `external_monitoring` | Classifier: platform logistics | System | route_eligibility=external_monitoring | — |
| `awaiting_route` | `in_suggestion` | RouteEngine creates suggestion | System (`run-route-engine`) | INSERT dispatch_suggestion; INSERT dispatch_suggestion_orders; INSERT order_events(route_suggested) | suggestion.id |
| `in_suggestion` | `dispatched` | Operator accepts suggestion | Operator | INSERT order_events(dispatched); call platform confirm; UPDATE dispatched_at | order.id |
| `in_suggestion` | `awaiting_route` | Operator rejects suggestion | Operator | INCREMENT rejection_count; INSERT order_events(rejected) | — |
| `awaiting_route` | `dispatch_timeout` | rejection_count ≥ MAX_REJECTIONS | System (`run-route-engine`) | route_eligibility=blocked; reason=max_rejections; INSERT dispatch_alerts; INSERT order_events(timeout) | order.id |
| `dispatched` | `delivered` | Platform webhook or operator action | Platform / Operator | INSERT order_events(delivered) | order.id |
| any active | `cancelled` | Platform cancellation | Platform | INSERT order_events(cancelled) | order.id |

---

## Alert Levels (computed column `alert_level`)

| Level | Condition | Applies to |
|-------|-----------|-----------|
| `null` | elapsed < 5 min or terminal status | — |
| `warning` | 5 min ≤ elapsed < 9 min | Active non-dispatched orders |
| `urgent` | 9 min ≤ elapsed < 10 min | Active non-dispatched orders |
| `overdue` | elapsed ≥ 10 min | Active non-dispatched orders |

Computed by backend (DB function or cron edge fn), stored in `orders.alert_level`.

---

## Idempotency Rules
- Duplicate webhook → deduplicated by `(store_id, platform, platform_order_id)` UNIQUE constraint.
- Classifier re-run → checks current status before updating; skips if already past `normalized`.
- RouteEngine re-run → skips if no eligible orders; uses advisory lock per store_id.
- Suggestion creation → guarded by checking existing `pending_review` suggestions per store.
