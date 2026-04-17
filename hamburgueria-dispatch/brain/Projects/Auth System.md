# Auth System

## Summary
Supabase Auth with a synthetic email convention. Users have usernames, but Supabase requires emails — so the login flow derives an email from the username. Role-based access + granular per-page permissions introduced in v1.

## Source
- `hamburgueria-dispatch/src/App.tsx`
- `hamburgueria-dispatch/src/pages/Login/index.tsx`
- `hamburgueria-dispatch/src/pages/Users/index.tsx`
- `.planning/codebase/ARCHITECTURE.md`

## Login Flow
1. User enters `username` + `password` in Login page
2. App queries `users` table: `SELECT auth_id FROM users WHERE username = ?`
3. Constructs email: `{username}@dispatch.internal`
4. Calls `supabase.auth.signInWithPassword({ email, password })`
5. `onAuthStateChange` fires in App.tsx with `SIGNED_IN` event
6. App fetches `role` + `permissions` from `users` table
7. `localStorage.setItem('dispatch_login_at', Date.now())` — 8-hour expiry tracking
8. Sidebar and pages render according to role + permissions

## Roles

| Role | Access |
|------|--------|
| `owner` | All pages including Users, Settings |
| `admin` | All pages except (some) admin functions |
| `operator` | Operational, Orders, Drivers — limited by permissions |

## Permissions (granular, v1 addition)
JSON column on `users` table:
```json
{ "operational": true, "orders": true, "drivers": true }
```
- Set per-user by owner/admin in Users page
- App.tsx `hasAccess(page)` function checks role + permissions
- Sidebar hides buttons for pages user can't access

## Session Management
- 8-hour session: `checkSessionExpiry()` checks `dispatch_login_at` in localStorage
- `onAuthStateChange` handles `SIGNED_OUT` and `TOKEN_REFRESHED` (without session) → auto-logout
- Supabase handles JWT refresh internally

## User Creation
- Users created by owner/admin in Users page
- Uses `supabaseAdmin` client (requires `VITE_SUPABASE_SERVICE_KEY`)
- Creates both: Supabase Auth user + `users` table record
- Email format: `{username}@dispatch.internal`

## Known Issues / Technical Debt
- Passwords not stored in DB (password_hash column removed ✓)
- Email convention `@dispatch.internal` = no real email recovery possible
- Session only tracked via localStorage — multi-tab sync not implemented
- `VITE_SUPABASE_SERVICE_KEY` is a frontend-accessible secret (high security risk)

## Related Notes
- [[Database Schema]]
- [[Decision Log]]
- [[Pending Work Register]]
