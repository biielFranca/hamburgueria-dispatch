# Route Engine

## Summary
Automatically pairs eligible orders and generates optimal dispatch route suggestions. Compares both delivery sequences to find the fastest route, then creates a `dispatch_suggestion` for the operator to review.

## Source
- `hamburgueria-dispatch/src/lib/routeEngine.ts`
- `hamburgueria-dispatch/src/components/RouteEngineService/index.tsx`
- `tasks_v1.md` — Bloco 4

## How It Works

### runRouteEngine(storeId: string)
Main coordinator function in `routeEngine.ts`:

1. **Fetch eligible orders**: SELECT orders WHERE `route_eligibility = 'eligible'` AND `status = 'awaiting_route'` AND `store_id = ?`, ordered by `rejection_count DESC`, `created_at ASC`
2. **Query routing API**: Given store origin + 2 order destinations, get travel time + distance (motorcycle profile)
3. **Compare sequences**: Calculate time for A→B and B→A, choose shorter
4. **Create suggestion**: INSERT into `dispatch_suggestions` + `dispatch_suggestion_orders` with `status = 'pending_review'`

### Single-Order Logic
If only 1 eligible order exists and it's been waiting >10 minutes: creates single-order suggestion instead of waiting for a pair.

### Rejection Handling
- Each rejection increments `rejection_count` on the order
- After 3 rejections without pairing: mark as `dispatch_timeout`, show alert on panel

### RouteEngineService Component
Background component. Subscribes to Supabase Realtime on `orders` table.
Triggers `runRouteEngine(storeId)` whenever an order is updated to `status = 'awaiting_route'`.

## External Routing API
- Configured via env vars: `VITE_ROUTES_API_KEY` and `VITE_ROUTES_API_URL`
- Recommended: Mapbox or Google Maps
- Profile: motorcycle (optimizes for delivery timing)
- Returns: travel time (seconds) + distance (meters) per segment

## Priorities
Orders are prioritized by:
1. `rejection_count DESC` — most-rejected orders get paired first
2. `created_at ASC` — oldest first within same rejection count

## Related Notes
- [[Classifier]]
- [[Data Flow]]
- [[Database Schema]]
- [[System Architecture]]
