# Frontend Critical Logic Map

## Summary
All domain logic currently running in the browser that must move to the backend.

## Source
`src/lib/classifier.ts`, `src/lib/routeEngine.ts`, `src/components/AlertSystem/index.tsx`,
`src/components/ClassifierService/index.tsx`, `src/components/RouteEngineService/index.tsx`,
`src/lib/geocoder.ts`, `src/lib/orderEvents.ts`, `src/App.tsx`

---

## Details

| # | Module | File | Trigger | DB Effects | Backend Destination |
|---|--------|------|---------|------------|---------------------|
| 1 | **ClassifierService** | `components/ClassifierService/index.tsx` | Mount + Realtime INSERT + poll 5s | UPDATE orders (route_eligibility, status) | Edge Function `classify-orders` |
| 2 | **classifyPendingOrders** | `lib/classifier.ts:81` | Called by above | UPDATE orders, INSERT order_events | idem |
| 3 | **classifyOrder (rules)** | `lib/classifier.ts:17` | In-process | None (pure fn) | Move to edge function |
| 4 | **geocodeOrderAddress** | `lib/geocoder.ts:102` | Called during classification | UPDATE orders.lat/lng | Edge Function `classify-orders` (internally) |
| 5 | **RouteEngineService** | `components/RouteEngineService/index.tsx` | Mount + Realtime UPDATE + poll 15s | INSERT dispatch_suggestions, UPDATE orders | Edge Function `run-route-engine` |
| 6 | **runRouteEngine** | `lib/routeEngine.ts:342` | Called by above | INSERT dispatch_suggestions, dispatch_suggestion_orders; UPDATE orders | idem |
| 7 | **handleTimeouts** | `lib/routeEngine.ts:150` | Inside runRouteEngine | UPDATE orders (dispatch_timeout), INSERT dispatch_alerts | idem |
| 8 | **AlertSystem severity** | `components/AlertSystem/index.tsx:225` | setInterval 20s | None — state is local | DB column `alert_level` set by backend cron/trigger |
| 9 | **logOrderEvent** | `lib/orderEvents.ts:36` | After every domain action | INSERT order_events | Must be called from backend, not client |
| 10 | **App.tsx: session/roles** | `App.tsx:30-118` | Mount | None | Auth Layer component |
| 11 | **App.tsx: service boot** | `App.tsx:177-178` | Mount | Starts Classifier + RouteEngine + Alert loops | Remove after backend migration |

## Polling Intervals (must be eliminated)
- ClassifierService: 5 000 ms (`CLASSIFIER_POLL_MS`)
- RouteEngineService: 15 000 ms (`POLL_INTERVAL_MS`)
- AlertSystem check: 20 000 ms (`CHECK_MS`)

## Direct Provider Calls (no abstraction)
- Nominatim: `lib/geocoder.ts:11` — hardcoded URL, no cache, no timeout, no metrics
- OSRM: `lib/routeEngine.ts:7` — hardcoded URL via env, no abstraction

## Decisions
- All 9 domain modules above must run server-side.
- Frontend keeps: render, sound, mute, map display, operator commands.
- `logOrderEvent` must never be called directly from client after migration.
