# System Architecture

## Summary
Tauri 2 desktop application with React 19 frontend, TypeScript, and Supabase as backend (auth + database + edge functions). Runs on Windows via WebView2. No separate backend server — all business logic lives in the frontend with Supabase Functions for sensitive operations.

## Source
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/INTEGRATIONS.md`
- `hamburgueria-dispatch/src/`

## Repository Structure

```
hamburgueria-dispatch/
├─ src/
│  ├─ App.tsx              # Root component — auth, routing, session
│  ├─ main.tsx             # React entry point
│  ├─ types/index.ts       # All domain types and enums
│  ├─ lib/
│  │  ├─ supabase.ts       # Supabase client factory (regular + admin)
│  │  ├─ classifier.ts     # Order classification logic
│  │  ├─ routeEngine.ts    # Dispatch route generation
│  │  ├─ alertSound.ts     # Web Audio API alert sounds
│  │  ├─ cep.ts            # ViaCEP address lookup
│  │  ├─ geocoder.ts       # Address geocoding
│  │  └─ integrations/
│  │     ├─ ifood.ts       # iFood API calls
│  │     └─ openDelivery.ts # Open Delivery (99Food, Keeta, Cardápio Web)
│  ├─ components/
│  │  ├─ AlertSystem/      # Background polling + alert toasts
│  │  ├─ ClassifierService/ # Background Realtime subscription
│  │  ├─ RouteEngineService/ # Background route generation
│  │  ├─ IfoodPoller/      # Background iFood sync polling
│  │  ├─ OrderForm/        # Manual order creation form
│  │  └─ layout/Sidebar.tsx
│  └─ pages/
│     ├─ Login/            # Username/password login
│     ├─ Operational/      # Main dispatch dashboard + map
│     ├─ Orders/           # Order list with real-time
│     ├─ Drivers/          # Driver management
│     ├─ Users/            # User management (owner/admin)
│     ├─ Settings/         # Store config (3 tabs)
│     └─ Dev/              # Dev tools (internal)
├─ src-tauri/
│  ├─ src/main.rs          # Tauri entry point
│  └─ src/lib.rs           # Plugin setup (http, opener)
```

## Architectural Patterns

- **No router library** — App.tsx uses `activePage` state + conditional rendering to navigate pages
- **No state management library** — Everything via React `useState` / `useRef` / `useEffect`
- **Background polling components** — AlertSystem, IfoodPoller, ClassifierService, RouteEngineService render invisibly and run setInterval/subscription loops
- **Service layer** — `src/lib/` contains all external API calls, with no direct fetch from pages
- **Tauri HTTP bridge** — HTTP requests use `@tauri-apps/plugin-http` with fallback to native fetch

## Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `App.tsx` | Auth state, session expiry, page routing, role-based access |
| `types/index.ts` | All domain interfaces and enums (no deps) |
| `lib/supabase.ts` | Supabase client factory — regular + admin (service key) |
| `lib/classifier.ts` | Pure function: `classifyOrder(order) → ClassificationResult` |
| `lib/routeEngine.ts` | `runRouteEngine(storeId)` — fetches eligible orders, calls routing API, creates suggestions |
| `ClassifierService` | Background: Supabase Realtime INSERT on `orders` → runs classifier → updates DB |
| `RouteEngineService` | Background: Supabase Realtime on `awaiting_route` → triggers route engine |
| `AlertSystem` | Background: polls every 20s → fires audio + toast by order age |
| `IfoodPoller` | Background: polls every 30s via Supabase Edge Function |

## Command Flow (order ingestion)
1. iFood Merchant API → `ifood-sync` Supabase Edge Function
2. Edge Function normalizes payload → inserts into `orders` table
3. Supabase Realtime fires INSERT event
4. `ClassifierService` receives event → `classifyOrder()` → updates `route_eligibility` + `status`
5. If `eligible` → `RouteEngineService` fires → pairs with other eligible orders → creates `dispatch_suggestion`
6. Operational page receives Realtime update → re-fetches suggestions
7. Operator selects driver + accepts → status becomes `dispatched`

## Routing Flow (page navigation)
- No URL routing. `App.tsx` holds `activePage: number` state
- `Sidebar.tsx` calls `onNavigate(pageIndex)` on button click
- `App.tsx` renders `activePage === 0 ? <Operational/> : activePage === 1 ? <Orders/> : ...`
- Access guards check `userRole` and `userPermissions` before rendering

## Configuration Flow
- `.env` in `hamburgueria-dispatch/` → `import.meta.env.VITE_*` → `lib/supabase.ts`
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` — always required
- `VITE_SUPABASE_SERVICE_KEY` — optional, enables user management (admin ops)

## Integration Points
- **Supabase PostgreSQL** — primary DB, auth, real-time subscriptions
- **Supabase Auth** — email/password with synthetic `username@dispatch.internal` scheme
- **Supabase Edge Functions** — `ifood-sync` for iFood order processing
- **iFood Merchant API** — order events, OAuth2 with client credentials
- **Open Delivery protocol** — 99Food, Keeta, Cardápio Web (partial)
- **ViaCEP API** — Brazilian postal code address lookup
- **External routing API** (Mapbox or Google Maps) — configured via env vars, used by Route Engine
- **Leaflet / react-leaflet** — map display in Operational page and Settings

## Inferred Design Philosophy
- Minimize external deps: no Redux, no router lib, no form lib
- Desktop-first: Tauri window is the single runtime target
- Real-time via Supabase subscriptions rather than websockets
- Keep business logic in `lib/` pure functions, side effects in background components

## Related Notes
- [[Data Flow]]
- [[Database Schema]]
- [[iFood Integration]]
- [[Open Delivery Integration]]
- [[Classifier]]
- [[Route Engine]]
- [[Project Overview]]
