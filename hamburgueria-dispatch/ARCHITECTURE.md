# Architecture

## Current Phase (V1 / V2)

```
┌─────────────────────────────────────────────┐
│              Tauri 2 Desktop App             │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │     React + TypeScript (Vite)        │   │
│  │                                      │   │
│  │  pages/  ──►  services/  ──►  lib/supabase.ts  │
│  │              (data layer)            │   │
│  └──────────────────────────────────────┘   │
│                     │                       │
│              WebView2 (Windows)              │
└─────────────────────┼───────────────────────┘
                      │  HTTPS / Realtime WS
              ┌───────▼────────┐
              │   Supabase     │
              │                │
              │  • Postgres    │
              │  • Auth        │
              │  • Realtime    │
              │  • Edge Fns    │
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │  External APIs │
              │  iFood         │
              │  Open Delivery │
              └────────────────┘
```

### Why this architecture

Supabase handles the full backend for the current product scope: authentication, data persistence, real-time subscriptions for orders and drivers, and Edge Functions for lightweight webhook processing. There is no reason to operate separate infrastructure at this stage.

Tauri 2 provides the native Windows shell. The frontend communicates with Supabase over HTTPS and WebSocket directly — no Tauri Rust layer is involved in data flow for the current feature set (the Rust side only manages the window and native OS access).

---

## Data Access Boundary

All Supabase calls are meant to go through `src/services/`:

```
src/services/
  auth.ts    — sign in, sign out, session, user role
  orders.ts  — order CRUD, realtime subscriptions, dispatch suggestions
  drivers.ts — driver CRUD, realtime subscriptions
  users.ts   — user management, permissions
  stores.ts  — store settings, platform integrations
```

`src/lib/supabase.ts` exports the single Supabase client instance. Services import from it; pages should import from services, not from `lib/supabase` directly. This is the seam that makes a future backend swap mechanical rather than surgical.

> Currently, most pages still import from `lib/supabase` directly. The `services/` layer was introduced as the intended interface. Pages should be migrated opportunistically.

---

## Parts That Must Stay Backend-Agnostic

These modules contain pure business logic and must not couple to Supabase:

| Module | Reason |
|---|---|
| `src/lib/classifier.ts` | Order classification rules — pure logic |
| `src/lib/routeEngine.ts` | Route optimization — pure logic (reads from Supabase, but the algorithm is isolated) |
| `src/lib/geocoder.ts` | Address geocoding — calls an external geocoding API, not Supabase |
| `src/lib/cep.ts` | ZIP code lookup — calls ViaCEP, not Supabase |
| `src/lib/integrations/` | iFood and Open Delivery API clients — call external platforms |
| `src/types/index.ts` | Domain types — no runtime dependency |

When a custom backend is introduced, these modules can move to the backend with minimal adaptation because they have no Supabase coupling.

---

## Future Phase (V3+) — Custom Bun Backend

```
┌─────────────────────────────────────────────┐
│              Tauri 2 Desktop App             │
│                                             │
│  pages/  ──►  services/  (same interface)   │
│                   │                         │
│              REST / WS                      │
└───────────────────┼─────────────────────────┘
                    │
           ┌────────▼────────┐
           │   Bun + Hono    │   ← or Elysia
           │   (custom API)  │
           └────────┬────────┘
                    │
           ┌────────▼────────┐     ┌──────────────┐
           │   Postgres      │     │  Supabase     │
           │   (self-hosted  │  or │  (retained)   │
           │   / Neon)       │     │               │
           └─────────────────┘     └──────────────┘
```

### What would justify this migration

- Business logic too complex or too slow for Edge Functions
- Need for custom WebSocket server (e.g., direct driver push instead of Supabase Realtime)
- Multi-tenant orchestration requiring server-side isolation
- Cost optimization at significant scale (Supabase pricing vs. self-hosted Postgres)
- Requirement for an API that external systems (POS, ERP) consume

### What changes and what stays

| Component | V1/V2 | V3+ |
|---|---|---|
| `src/services/` interface | Supabase-backed | Backed by Bun API (same function signatures) |
| `src/lib/supabase.ts` | Active client | Replaced by HTTP/WS client in services |
| `src/lib/classifier.ts` | Runs in frontend | Moves to Bun backend |
| `src/lib/routeEngine.ts` | Runs in frontend | Moves to Bun backend |
| `src/types/index.ts` | Shared | Shared (or generated from backend schema) |
| Tauri shell | Unchanged | Unchanged |
| React pages | Unchanged | Unchanged |

The migration path is: implement the Bun backend, update `src/services/` to call the new API instead of Supabase, keep all page code untouched.

---

## Tauri Mobile — Driver App

The motoboy/driver-side experience is deferred. When it becomes a priority:

1. Evaluate **Tauri Mobile** first — it would keep the same Rust/TypeScript stack and allow code sharing with the desktop app.
2. Fall back to React Native only if Tauri Mobile has blocking limitations for the target Android/iOS use case.

No decision has been made. No code should be written assuming either path.
