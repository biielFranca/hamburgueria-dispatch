# backend/

> **Status: placeholder — not yet implemented.**
>
> This directory is reserved for the future custom Bun backend (V3+).
> The desktop app currently talks directly to Supabase. See [ARCHITECTURE.md](../hamburgueria-dispatch/ARCHITECTURE.md) for the migration rationale.

---

## Planned Stack

| Concern | Choice |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| HTTP framework | [Hono](https://hono.dev) or [Elysia](https://elysiajs.com) |
| Database | Postgres (Supabase-managed or Neon) |
| Auth | Supabase Auth (retained) or custom JWT |

## When to Build This

Build the Bun backend when at least one of these is true:

- Business logic is too heavy or too latency-sensitive for Supabase Edge Functions
- A custom WebSocket server is needed for direct driver push notifications
- External systems (POS, ERP, franchisor APIs) need a real API to consume
- Multi-tenant orchestration requires server-side isolation not achievable in the frontend
- Supabase costs become significant relative to self-hosted Postgres at scale

## Migration Path

1. Create the Bun server here (`backend/src/`).
2. Implement the same data operations currently in `hamburgueria-dispatch/src/services/`.
3. Update `src/services/` to call the Bun API over HTTP/WS instead of Supabase directly.
4. Keep all page and component code in the desktop app unchanged.

The `src/services/` interface in the desktop app was designed to be this seam — the pages do not care whether the data comes from Supabase or a custom API.

## Candidate Modules to Extract

These are backend-agnostic and can move here with minimal adaptation:

- `src/lib/classifier.ts` — order classification logic
- `src/lib/routeEngine.ts` — route optimization engine
- `src/lib/integrations/ifood.ts` — iFood poller (webhook receiver instead of frontend polling)
- `src/lib/integrations/openDelivery.ts` — Open Delivery handler
