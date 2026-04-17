# Pending Work Register

## Summary
Known bugs, security issues, performance bottlenecks, missing features, and technical debt from Hamburgueria Dispatch v1. All v1 tasks (64/64) are complete. This register tracks what's next.

## Source
- `.planning/codebase/CONCERNS.md`
- `tasks_v1.md`
- `task-log.md`

---

## 🔴 High Priority — Security

- [ ] **Remove VITE_SUPABASE_SERVICE_KEY from frontend** — move all admin user operations to Supabase Edge Function. This is the #1 security risk.
- [ ] **Encrypt iFood/platform credentials at rest** — `store_integrations.client_secret` is plaintext in DB. Use Supabase Vault or encrypt before storing.
- [ ] **Validate service key at startup** — currently admin ops silently fail if `VITE_SUPABASE_SERVICE_KEY` is missing. Add startup check + disable admin UI gracefully.

---

## 🟡 Medium Priority — Bugs

- [ ] **iFood poller ignores integration toggle** — toggling active/inactive in Settings → Connections requires page reload. IfoodPoller reads `active` status once on mount. Fix: subscribe to Realtime changes on `store_integrations`.
- [ ] **Alert sound multiple AudioContext instances** — rapid alerts create multiple AudioContext instances, causing browser errors. Fix: single module-level AudioContext instance.
- [ ] **Dispatch suggestion enrichment race condition** — suggestion blocks sometimes show empty order list under slow network. Fix: DB join to fetch suggestions with orders in single query.
- [ ] **Order modal close animation flicker** — content flickers during close transition. Fix: align CSS transition duration with setTimeout delay (250ms).

---

## 🟡 Medium Priority — Technical Debt

- [ ] **Centralize platform colors** — `platformColors` map duplicated in 3 files (`Orders`, `Operational`, `AlertSystem`). Create `src/lib/platformConfig.ts`.
- [ ] **useStoreId() hook** — every component fetches `store_id` independently on mount (7+ components). Create custom hook or React Context to fetch + cache once.
- [ ] **Add React Error Boundaries** — no error boundaries in the app. A crash in any component unmounts the entire app.
- [ ] **Replace Date.now() + Math.random() IDs** — `OrderForm` uses non-cryptographic IDs. Replace with `crypto.randomUUID()`.
- [ ] **Null checks in Operational map** — order `latitude`/`longitude` not null-checked in some renders. Add optional chaining throughout.
- [ ] **Real email scheme for auth** — `username@dispatch.internal` prevents email-based password recovery. Migrate to real emails + proper reset flow.

---

## 🟡 Medium Priority — Performance

- [ ] **Full refetch on any Realtime event** — Operational page calls `fetchAll()` on any `postgres_changes` event. Switch to incremental updates.
- [ ] **Pagination on Orders list** — all orders loaded without limit. Add cursor-based pagination for stores with many orders.
- [ ] **AlertSystem per-order cache** — currently rebuilds alert state from scratch every 20s. Track last-checked timestamps, query only new orders.
- [ ] **OperationalMap tick optimization** — `markerStates` Map recomputed every second for ghost fade. Replace with CSS opacity animation.
- [ ] **Suggestions with orders in single query** — currently two-phase fetch. Add DB view/RPC joining `dispatch_suggestions` with `dispatch_suggestion_orders` + `orders`.

---

## 🟢 Low Priority — Missing Features

- [ ] **Activate Open Delivery integrations** — 99Food, Keeta, Cardápio Web. Library exists (`openDelivery.ts`). Show UI in Settings → Connections.
- [ ] **Offline support** — app fails completely without Supabase connection. Add local SQLite cache + sync queue.
- [ ] **Order history / audit trail** — no record of status transitions, rejection reasons. Add `order_events` table.
- [ ] **Driver GPS tracking** — no real-time driver location on map. Would need mobile companion app or geolocation API.
- [ ] **Push / desktop notifications** — operators must watch screen constantly. Add Tauri desktop notification API for new suggestions and overdue orders.
- [ ] **Batch operations** — can only accept/reject one suggestion at a time. Add bulk management.
- [ ] **Multi-tab session sync** — logout in one tab not propagated. Implement `BroadcastChannel` API.

---

## 🔵 Test Coverage Gaps

- [ ] **Zero automated tests** — no test framework configured. High risk for all core logic.
- [ ] **Classifier unit tests** — pure function, easy to test. Add Vitest tests for all 5 rules.
- [ ] **Route engine unit tests** — test sequence comparison logic, single-order fallback, timeout logic.
- [ ] **Auth flow tests** — login mapping, session expiry, missing service key handling.
- [ ] **Realtime reconnection behavior** — what happens when Supabase subscription drops silently?
- [ ] **Alert deduplication edge cases** — rapid order creation/deletion, mid-alert status changes.

---

## Structural Gaps

- No CI/CD pipeline — manual local builds only
- No error tracking service (Sentry etc.)
- No structured logging — only `console.log`

## Related Notes
- [[Decision Log]]
- [[Roadmap]]
- [[System Architecture]]
- [[Auth System]]
- [[iFood Integration]]
