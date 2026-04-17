# Roadmap

## Summary
Hamburgueria Dispatch execution plan. v1 is shipped and complete. v2 priorities based on known technical debt and missing features.

## Source
- `tasks_v1.md` — v1 scope definition
- `task-log.md` — v1 completion record
- `.planning/codebase/CONCERNS.md` — issues to address

---

## ✅ v1 — COMPLETE (64/64 tasks)

### Shipped
- Base security (gitignore, RLS, session listener, remove password_hash)
- Store settings page with Leaflet map + CEP auto-fill
- Logistic classifier (5 rules + default) with Realtime background service
- Route engine (pair optimization + single-order fallback + rejection counting)
- iFood integration (OAuth2, polling, Edge Function, credential management)
- Open Delivery library (99Food, Keeta, Cardápio Web — lib only, UI hidden)
- Alert system (3 levels, audio via Web Audio API)
- CEP auto-fill in OrderForm + Settings
- User management with role + granular per-page permissions
- Settings page restructured with 3 tabs (General, Connections, Plan)

---

## 🔴 v2 — Security Fixes (High Priority)

### Phase 1: Security Hardening
**Goals:**
- Remove `VITE_SUPABASE_SERVICE_KEY` from frontend
- Encrypt credentials at rest
- Harden admin operations

**Deliverables:**
- [ ] Supabase Edge Function for user create/update/delete
- [ ] Remove `supabaseAdmin` from frontend
- [ ] Encrypt `client_secret` in `store_integrations` using Supabase Vault or pgcrypto
- [ ] Add startup validation for missing keys

**Risks:**
- Breaking change in user management flow
- Need to test Edge Function permissions carefully

---

### Phase 2: Critical Bug Fixes
**Goals:**
- Fix the 4 medium-priority bugs

**Deliverables:**
- [ ] IfoodPoller: subscribe to `store_integrations` Realtime changes
- [ ] AlertSound: single AudioContext instance at module level
- [ ] Dispatch suggestion: DB join (RPC or view) for single-query enrichment
- [ ] Order modal: CSS transition timing fix

---

### Phase 3: Developer Foundation
**Goals:**
- Add test suite foundation
- Centralize shared constants

**Deliverables:**
- [ ] Add Vitest + configure test runner
- [ ] Classifier unit tests (5 rules coverage)
- [ ] Route engine unit tests
- [ ] `src/lib/platformConfig.ts` — centralize platform colors
- [ ] `useStoreId()` custom hook — eliminate repeated store_id fetches

---

## 🟡 v3 — Open Delivery Activation

### Phase 4: Activate Platform Integrations
**Goals:**
- Enable 99Food, Cardápio Web, Keeta in production
- Show integration cards in Settings → Connections

**Deliverables:**
- [ ] UI for 99Food credentials + toggle
- [ ] UI for Cardápio Web credentials + toggle
- [ ] UI for Keeta credentials + toggle
- [ ] Webhook handler for Cardápio Web
- [ ] Test with real platform credentials

---

## 🟢 v4 — Stability & Scale

### Phase 5: Performance
- Pagination on Orders list
- Incremental Realtime updates (no more fetchAll)
- Single-query suggestion enrichment
- CSS-based map ghost animations

### Phase 6: Missing Features
- Offline support with local SQLite cache
- Order history / audit trail
- Desktop push notifications
- Batch accept/reject

---

## Related Notes
- [[Pending Work Register]]
- [[Project Overview]]
- [[Decision Log]]
