# Decision Log

## Summary
Explicit and strongly implied architectural decisions made during Hamburgueria Dispatch v1 development.

## Decision 001
### Title
Tauri 2 + React for desktop app

### Status
Accepted

### Context
Needed a Windows desktop app with web UI capabilities and native system integration. Alternatives: Electron, pure WPF.

### Decision
Tauri 2 with React + TypeScript + WebView2.

### Consequences
- Smaller bundle than Electron
- Rust backend for system operations
- WebView2 dependency on Windows (pre-installed on Win11, optional on Win10)
- Limited Tauri 2 ecosystem maturity

### Source
`.planning/codebase/STACK.md`

---

## Decision 002
### Title
Supabase as sole backend

### Status
Accepted

### Context
Needed database, auth, real-time, and edge functions. No dedicated backend server.

### Decision
Supabase for everything: PostgreSQL, Auth, Realtime subscriptions, Edge Functions.

### Consequences
- No custom backend server to maintain
- iFood integration handled via Edge Function (avoids CORS and secret exposure)
- Locked into Supabase pricing/limits
- Real-time via PostgRES subscriptions (not websockets)

### Source
`.planning/codebase/INTEGRATIONS.md`

---

## Decision 003
### Title
Synthetic email scheme for auth

### Status
Accepted — but flagged as technical debt

### Context
Store operators don't have personal emails. Supabase Auth requires email format.

### Decision
Derive email from username: `{username}@dispatch.internal`. Never send emails.

### Consequences
- ✅ Simple for internal operator accounts
- ❌ No password recovery via email
- ❌ Supabase could change email validation rules and lock existing users out
- Risk: migration path to real emails is complex

### Source
`hamburgueria-dispatch/src/pages/Login/index.tsx` (line 39)

---

## Decision 004
### Title
No router library — conditional rendering

### Status
Accepted

### Context
Single-window desktop app. No browser URL bar, no bookmarks, no back/forward.

### Decision
`activePage: number` state in `App.tsx` + ternary rendering. No React Router.

### Consequences
- ✅ Simpler, fewer deps, faster navigation
- ❌ No URL-based deep linking
- ❌ Harder to add sub-pages later without refactor
- Page guards require manual checks rather than route-level config

### Source
`.planning/codebase/ARCHITECTURE.md`

---

## Decision 005
### Title
No Redux/Context — local state only

### Status
Accepted

### Context
App is relatively simple flow-wise. Global state concerns: session, userRole, storeId.

### Decision
All state via React `useState`/`useRef`. Session + role passed as props from App.

### Consequences
- ✅ Less boilerplate, simpler mental model
- ❌ `store_id` fetched independently by each component — N duplicate DB queries on mount
- ❌ No reactive updates between sibling components without prop drilling

### Source
`.planning/codebase/ARCHITECTURE.md`

---

## Decision 006
### Title
Background polling components instead of global service

### Status
Accepted

### Context
Needed continuous background operations: iFood polling, alert checking, classification, route generation.

### Decision
Each background operation is a React component (AlertSystem, IfoodPoller, ClassifierService, RouteEngineService) rendered invisibly at App root.

### Consequences
- ✅ Lifecycle tied to React tree (clean unmount)
- ✅ State stays in component (no global coupling)
- ❌ Multiple setInterval instances competing
- ❌ Each has its own storeId fetch on mount

### Source
`.planning/codebase/ARCHITECTURE.md`

---

## Decision 007
### Title
Credentials stored in `store_integrations` table (plaintext)

### Status
Accepted — security debt acknowledged

### Context
iFood and Open Delivery require client_id + client_secret per store.

### Decision
Store credentials in `store_integrations.client_secret` in plaintext. Access controlled by RLS (owner/admin only).

### Consequences
- ✅ Simple implementation
- ❌ DB admin or breach exposes all credentials
- Recommendation: Supabase Vault or server-side encryption before storing

### Source
`.planning/codebase/CONCERNS.md`

---

## Decision 008
### Title
VITE_SUPABASE_SERVICE_KEY in frontend env

### Status
Accepted — high-risk debt

### Context
User management requires service role key for `supabaseAdmin` client.

### Decision
Service key provided via `VITE_SUPABASE_SERVICE_KEY` environment variable, accessible in browser bundle.

### Consequences
- ❌ Critical: Key potentially exposed in production bundle
- ❌ Anyone with access to the Tauri binary could extract the key
- Mitigation needed: Move all admin operations to Supabase Edge Functions. Remove service key from frontend.

### Source
`.planning/codebase/CONCERNS.md`

---

## Decision 009
### Title
Permissions as JSONB column on users table

### Status
Accepted

### Context
Operators needed granular page access control beyond simple role hierarchy.

### Decision
`permissions jsonb DEFAULT '{"operational":true,"orders":true,"drivers":true}'` on `users` table. App.tsx `hasAccess()` checks both `role` and `permissions`.

### Consequences
- ✅ Flexible: add new permissions without schema change
- ✅ Per-user granularity within operator role
- ❌ No enforcement on DB level — only frontend guards

### Source
`task-log.md` — Bloco 9

---

## Related Notes
- [[Project Overview]]
- [[Auth System]]
- [[Pending Work Register]]
- [[System Architecture]]
