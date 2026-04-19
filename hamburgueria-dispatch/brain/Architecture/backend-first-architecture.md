# Backend-First Architecture

## Summary
Formal definition of the four logical layers and responsibility split between frontend and backend.

---

## Layers

### Layer 1 — Ingestion
Receives external events and normalises them into internal domain objects.

| Event | Process | Persistence | Output Event |
|-------|---------|-------------|--------------|
| Open Delivery webhook POST | `open-delivery-webhook` edge fn | INSERT orders (status=received) | Realtime broadcast → `classify-orders` |
| iFood polling (frontend) | `IfoodPoller` → supabase insert | INSERT orders (status=received) | Realtime INSERT triggers classifier |
| Manual order creation | Operator form → `orders.insert` | INSERT orders (status=normalized) | Realtime INSERT triggers classifier |

### Layer 2 — Domain
Pure business rules, no I/O.

| Module | Edge Function | Inputs | Outputs |
|--------|---------------|--------|---------|
| Classifier | `classify-orders` | order row | route_eligibility, status, geocoded coords |
| RouteEngine | `run-route-engine` | store_id | dispatch_suggestion row, orders.status=in_suggestion |
| AlertState | DB function / `compute-alert-state` cron | orders table | orders.alert_level column |
| Timeout / Requeue | Inside `run-route-engine` | rejection_count | orders.status=dispatch_timeout |

### Layer 3 — Orchestration
Reacts to domain events and coordinates cross-module flows.

| Event | Orchestrator | Effect |
|-------|-------------|--------|
| order.status = awaiting_route | Realtime → invoke `run-route-engine` | Creates suggestion |
| order.status = in_suggestion (accepted) | Dispatch confirm edge fn | Confirms to platform, marks dispatched |
| stock movement inserted | DB trigger → `recompute-availability` | Updates item_availability_state |
| order dispatched | DB trigger | Decrements inventory_items.quantity |

### Layer 4 — Exposure
What the frontend consumes. Read-only or command-only surface.

| Type | Example | Consumer |
|------|---------|----------|
| Realtime stream | `orders` table changes | Operational page |
| Realtime stream | `dispatch_suggestions` table | Operational page |
| Realtime stream | `orders.alert_level` column | AlertSystem (render only) |
| RPC / edge fn | `dispatch-confirm` | Operator dispatch button |
| REST query | `GET /orders?store_id=X` | Orders page |

---

## Responsibility Split

### Frontend keeps
- Rendering pages and components
- Playing alert sounds, muting
- Displaying map (Leaflet + route geometry)
- Sending operator commands (dispatch, reject suggestion, edit order)
- Auth token management (Supabase client)
- Reading state produced by backend

### Frontend removes
- `ClassifierService` component (after edge fn deployed)
- `RouteEngineService` component (after edge fn deployed)
- `AlertSystem` severity computation (after alert_level column populated by backend)
- Direct calls to Nominatim (move to edge fn)
- Direct calls to OSRM from `routeEngine.ts` (move to edge fn)
- `logOrderEvent` calls from client (backend writes audit)

### Backend takes
- All domain logic from the mapping document
- Geocoding with cache and timeout
- Route optimisation with fallback
- Audit trail (order_events INSERT)
- Alert level computation
- Retry of external integrations

---

## Decisions
- Edge Functions over workers initially: simpler deployment on Supabase free tier.
- `run-route-engine` uses advisory lock via `pg_advisory_xact_lock(store_id_hash)` to serialise per store.
- Frontend invokes edge fns only for commands (dispatch confirm, manual requeue). Never for reads.
- iFood polling stays in frontend temporarily (no webhook support); will move when webhook available.
