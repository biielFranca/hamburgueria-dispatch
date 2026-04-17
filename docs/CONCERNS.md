# Codebase Concerns

**Analysis Date:** 2026-04-09

## Tech Debt

**Session Management with Local Storage:**
- Issue: Session expiry is tracked via localStorage with a hardcoded 8-hour timeout (SESSION_DURATION = 8 * 60 * 60 * 1000) in `App.tsx`
- Files: `src/App.tsx` (lines 18, 33-39, 60-61)
- Impact: No server-side session validation. If user clears localStorage or uses multiple windows, session state becomes unreliable. The client-side timer can be bypassed.
- Fix approach: Implement server-side session validation with Supabase JWT refresh tokens. Store session timestamps in Supabase instead of localStorage. Remove client-side session expiry logic.

**Authentication Email Format Hardcoded:**
- Issue: User authentication uses a synthetic email format `${username}@dispatch.internal` that doesn't correspond to real email addresses
- Files: `src/pages/Login/index.tsx` (line 39), `src/pages/Users/index.tsx` (line 97)
- Impact: Users cannot reset passwords via email recovery. No way to associate real email addresses with accounts. Lock-in to this application's auth scheme.
- Fix approach: Store actual email addresses in the users table. Use real emails for Supabase auth. Add email verification flow.

**Hardcoded Platform Colors in Multiple Places:**
- Issue: Platform color definitions (iFood red #EA1D2C, Keeta green #27AE60, etc.) are duplicated across multiple files
- Files: `src/pages/Orders/index.tsx` (lines 9-14), `src/pages/Operational/index.tsx` (lines 10-15), `src/components/AlertSystem/index.tsx` (lines 14-19)
- Impact: Changing platform colors requires updates in 3+ files. Inconsistency risk if missed.
- Fix approach: Create a shared constants file `src/lib/platformConfig.ts` with centralized color definitions. Import throughout the app.

**Manual Store ID Resolution in Every Component:**
- Issue: Multiple components independently fetch store_id from auth→users table every mount
- Files: `src/pages/Orders/index.tsx`, `src/pages/Operational/index.tsx`, `src/components/IfoodPoller/index.tsx`, `src/pages/Drivers/index.tsx`, `src/components/AlertSystem/index.tsx`, `src/pages/Integrations/index.tsx`, `src/pages/Users/index.tsx`
- Impact: Repetitive async logic, multiple database queries, race conditions possible if queries don't complete before dependent operations
- Fix approach: Create a custom hook `useStoreId()` or React Context that resolves and caches store_id once globally

**No Error Boundaries:**
- Issue: Application has no error boundaries. Component crashes in one module crash entire app
- Files: `src/App.tsx`
- Impact: Unhandled errors in any page or component unmount entire application
- Fix approach: Add React Error Boundary component at app root, with fallback UI and error logging

**UID Generation Using Date.now() + Math.random():**
- Issue: Item IDs in OrderForm use `Date.now() + Math.random()` as unique identifiers
- Files: `src/components/OrderForm/index.tsx` (lines 56-58)
- Impact: Not cryptographically secure, potential collision under rapid creation
- Fix approach: Use `crypto.randomUUID()` or nanoid library

**Missing Null Checks in Data Display:**
- Issue: Order data assumes fields like `latitude`, `longitude` exist without null coalescing in some renders
- Files: `src/pages/Operational/OperationalMap.tsx` (lines 194-201), `src/pages/Operational/index.tsx` (lines 397-407)
- Impact: Potential undefined value renders if geocoding fails on orders
- Fix approach: Use optional chaining consistently (`order?.latitude`) and provide fallback values

**Unary Admin Client Creation:**
- Issue: `supabaseAdmin` in `src/lib/supabase.ts` is conditionally created only if `VITE_SUPABASE_SERVICE_KEY` env var exists
- Files: `src/lib/supabase.ts` (lines 11-18)
- Impact: Admin operations (user creation, editing) silently fail with no error if service key is missing. Error messages in UI reference env variable but don't prevent execution.
- Fix approach: Validate service key at startup. Throw error if required for admin operations but missing. Add feature flags to disable admin UI if key unavailable.

## Known Bugs

**iFood Poller Unresponsive to Integration Toggle Changes:**
- Symptoms: Toggling iFood integration on/off in Integrations page doesn't immediately affect polling in IfoodPoller component
- Files: `src/components/IfoodPoller/index.tsx` (lines 34-41), `src/pages/Integrations/index.tsx`
- Trigger: Enable/disable iFood integration, observe poller continues with old state
- Cause: IfoodPoller resolves active status once on mount. Changes to `store_integrations` table don't re-trigger init effect. `activeRef` is never updated.
- Workaround: Refresh entire page to see integration changes take effect
- Fix approach: Subscribe to real-time changes on `store_integrations` table in IfoodPoller. Update `activeRef` when integration status changes.

**Alert Sound Tries to Play Too Many Times:**
- Symptoms: Audio context errors in console if alerts fire rapidly
- Files: `src/components/AlertSystem/index.tsx` (lines 45-79)
- Trigger: Multiple orders hit warning/urgent/overdue state within seconds
- Cause: `playSound()` creates new AudioContext each time. Browser limits concurrent contexts. No error handling for context creation failures.
- Fix approach: Create single AudioContext instance at module level. Reuse for all sounds. Handle AudioContext creation errors gracefully.

**Order Modal Close Animation Flicker:**
- Symptoms: Modal content flickers briefly when closing if modal still rendering during CSS transition
- Files: `src/pages/Orders/index.tsx` (lines 105-130)
- Cause: `prevOrder` ref shows old content while `visible` is false, but CSS transition still running. requestAnimationFrame timing may vary.
- Fix approach: Ensure CSS transition duration matches setTimeout delay (250ms). Consider using Framer Motion or CSS transitions more predictably.

**Dispatch Suggestion Enrichment Race Condition:**
- Symptoms: Suggestion blocks sometimes show empty order list
- Files: `src/pages/Operational/index.tsx` (lines 287-299)
- Trigger: High load or slow network when fetching suggestions + their orders
- Cause: Two-phase fetch: (1) get suggestions, (2) fetch orders for suggested_sequence IDs. If network is slow, orders may not match sequence IDs.
- Fix approach: Use database join to fetch suggestions with orders in single query. Or add retry logic with timeout.

## Security Considerations

**Service Role Key in Frontend:**
- Risk: `VITE_SUPABASE_SERVICE_KEY` is exposed in frontend bundle if included (though env vars should not be bundled, there's risk of misconfiguration)
- Files: `src/lib/supabase.ts` (line 5)
- Current mitigation: Service key should only be in `.env` (which is .gitignored). Vite should strip it from bundle since it's a `VITE_` prefixed var, but verification needed.
- Recommendations: Never use `VITE_` prefix for secrets. Move admin operations to backend Supabase functions. Verify bundle does not contain service key (audit build output).

**Password Stored in Database:**
- Risk: User passwords stored plaintext in `users` table "for owner visibility" per Users.tsx comments
- Files: `src/pages/Users/index.tsx` (line 118)
- Current mitigation: Users are only created by owner/admin, internal emails only
- Recommendations: Remove plaintext password storage entirely. Use Supabase auth exclusively for password management. If owner needs to view passwords, implement password reset flow instead.

**iFood Credentials in Database:**
- Risk: iFood Client Secret stored in plaintext in `store_integrations` table
- Files: `src/pages/Integrations/index.tsx` (line 94)
- Current mitigation: Only accessible to owner/admin roles in UI
- Recommendations: Encrypt client secrets at rest using Supabase Vault or encrypt before storing. Never log credentials. Consider moving to backend-only credential management.

**No Input Validation on Address Fields:**
- Risk: Address fields in OrderForm accept any input, including XSS payloads or SQL-like strings (though Supabase auth mitigates most risk)
- Files: `src/components/OrderForm/index.tsx` (fields from lines 30-35)
- Current mitigation: Supabase auth handles parameterization
- Recommendations: Add regex validation for address fields. Sanitize customer name input.

**No Rate Limiting on Polling:**
- Risk: IfoodPoller polls every 30 seconds without backoff. If Supabase function fails repeatedly, creates spam load
- Files: `src/components/IfoodPoller/index.tsx` (line 5, line 70)
- Current mitigation: None
- Recommendations: Implement exponential backoff on repeated failures. Respect error response codes (e.g., don't retry on 4xx).

## Performance Bottlenecks

**Operational Page Fetches Everything on Change:**
- Problem: Any change to orders, suggestions, or drivers re-fetches entire datasets via `fetchAll()`
- Files: `src/pages/Operational/index.tsx` (lines 257-319, line 313-315)
- Cause: Real-time subscription triggers full refetch on any `postgres_changes` event
- Improvement path: Use real-time subscriptions more granularly. Only refetch affected rows or use incremental updates instead of full reload.

**AlertSystem Checks All Orders Every 20 Seconds:**
- Problem: `checkOrders()` runs every 20 seconds, querying all active orders for the store
- Files: `src/components/AlertSystem/index.tsx` (lines 12, 181-208, 214)
- Cause: No filtering or state tracking; rebuilds alert state from scratch each interval
- Improvement path: Track last-checked timestamps per order. Maintain in-memory alert cache. Query only new/updated orders.

**OperationalMap Recomputes All Markers on Every Tick:**
- Problem: `markerStates` Map is recomputed every second (tied to `tick` state)
- Files: `src/pages/Operational/index.tsx` (lines 410-450)
- Cause: Used to compute ghost fade effect for dispatched orders, but recomputes entire map unnecessarily
- Improvement path: Split ghost fade into separate effect. Use CSS opacity animation instead of JS state change.

**Suggestion Enrichment Requires Second Query:**
- Problem: After fetching suggestions, must query orders table again to hydrate with order details
- Files: `src/pages/Operational/index.tsx` (lines 289-292)
- Cause: Database schema doesn't include eager-load of orders in suggestions
- Improvement path: Add database view or stored procedure that joins suggestions with orders. Return enriched data in single query.

**No Pagination on Orders List:**
- Problem: Orders page loads all non-delivered/cancelled orders without limit. Stores with 1000+ orders will render all
- Files: `src/pages/Orders/index.tsx` (lines 279-285)
- Impact: Large order lists cause UI slowdown and memory bloat
- Improvement path: Implement cursor-based pagination or virtual scrolling

## Fragile Areas

**Alert System Deduplication:**
- Files: `src/components/AlertSystem/index.tsx` (lines 137-141)
- Why fragile: Alert deduplication uses `Set<string>` keyed by `${order.id}-${level}`. If order ID changes or alert level logic changes, duplicates appear. No persistence across app reload.
- Safe modification: Document keying scheme. Add tests for deduplication logic. Consider moving to backend if alerts become persistent.
- Test coverage: No unit tests for alert deduplication

**Driver Selection State Synchronization:**
- Files: `src/pages/Operational/index.tsx` (lines 232, 579-582)
- Why fragile: `driverSelections` state holds selected driver IDs. If driver list changes (driver deleted), selected driver ID becomes orphan. No validation.
- Safe modification: Validate driver ID exists before accepting suggestion. Clear selection if driver is deleted.
- Test coverage: No tests for stale driver selection handling

**Manual Route Polyline Coordinate Assembly:**
- Files: `src/pages/Operational/index.tsx` (lines 394-408)
- Why fragile: Route coordinates manually assembled from store + selected sequence orders. If order coordinates are missing or mismatched, polyline breaks.
- Safe modification: Add validation that all orders in sequence have coordinates. Log warnings if coordinates missing.
- Test coverage: No tests for invalid coordinate handling

**OrderModal Render State Tracking:**
- Files: `src/pages/Orders/index.tsx` (lines 106-111)
- Why fragile: Uses `prevOrder` ref to keep showing old content during close animation. If close animation is interrupted, ref gets orphaned.
- Safe modification: Use state machine or conditional logic clearer than ref tracking
- Test coverage: Manual animation testing only

## Scaling Limits

**Real-time Subscriptions on All Data Tables:**
- Current capacity: App subscribes to changes on orders, dispatch_suggestions, drivers tables simultaneously
- Limit: Supabase has per-client connection limits. If many users connect, subscriptions may fail
- Scaling path: Implement multiplexing. Use single channel with multiple event handlers. Add backpressure handling. Consider moving to webhook-based sync for heavy operations.

**In-Memory Polling State:**
- Current capacity: `inProgress` array in Operational holds recent dispatches. Limited to DISPATCH_GHOST_MS (60 seconds)
- Limit: If 100+ dispatches per minute, old entries get garbage collected too fast for UI display
- Scaling path: Persist dispatch history to database. Add dismissible history view instead of auto-cleanup.

**localStorage-Based Session:**
- Current capacity: localStorage is per-domain, works for single-tab usage
- Limit: Multi-tab scenarios: user logs out in one tab, other tab doesn't know. Session sync not implemented.
- Scaling path: Use BroadcastChannel API to sync session state across tabs. Or move to server-side sessions.

**Map Rendering with 500+ Orders:**
- Current capacity: Leaflet renders all orders as individual markers
- Limit: 500+ markers cause visible slowdown. No clustering.
- Scaling path: Implement marker clustering (Leaflet.MarkerCluster). Or implement virtual scrolling for orders list.

## Dependencies at Risk

**Tauri 2 with Windows WebView2:**
- Risk: Tauri 2 Windows support via WebView2 is relatively new. Breaking changes possible in minor versions.
- Impact: Desktop app breaks with Tauri updates. Bundled WebView2 version mismatch causes runtime errors.
- Migration plan: Pin Tauri CLI and plugin versions strictly. Test each Tauri minor update before upgrading. Consider moving to Electron if Tauri stability issues persist.

**react-leaflet 5.0.0 with Leaflet 1.9.4:**
- Risk: Leaflet is mature but not actively developed. React-leaflet 5 is newer, may have undiscovered bugs.
- Impact: Map features may break unexpectedly. Marker clustering or custom icons may fail.
- Migration plan: Use stable version 1.9.4 of Leaflet indefinitely. If switching to Leaflet 1.10+, test map rendering extensively. Consider MapLibre GL as alternative.

**Supabase Auth Without Custom Domain:**
- Risk: Using internal synthetic emails (`username@dispatch.internal`) bypasses Supabase's standard email validation
- Impact: If Supabase auth changes email domain validation rules, existing users lock out
- Migration plan: Migrate to real email scheme as described in Security Considerations

## Missing Critical Features

**Offline Support:**
- Problem: App requires live Supabase connection. Airplane mode or network dropout causes complete failure.
- Blocks: Can't continue operations if connectivity drops. Tauri desktop app should handle offline gracefully.
- Recommendation: Implement local SQLite cache. Queue changes while offline. Sync when reconnected.

**Order History/Audit Trail:**
- Problem: No record of order status changes, rejection reasons, or dispatch modifications.
- Blocks: Operators can't review why orders were rejected. No accountability for changes.
- Recommendation: Add `order_events` table with timestamps and user ID. Log all transitions.

**Driver Location Tracking:**
- Problem: No way to see real-time driver GPS location on map.
- Blocks: Can't verify drivers are actually delivering orders.
- Recommendation: Add driver location updates (via mobile app or browser geolocation). Render driver markers on map.

**Notification/Push System:**
- Problem: No way to alert operators about new suggestion arrivals or urgent situations except UI polling.
- Blocks: Operators must watch screen constantly. Missed notifications if app minimized.
- Recommendation: Add desktop notifications API (Tauri notifications). Send alerts for new suggestions, overdue orders.

**Batch Operations:**
- Problem: Can only accept/reject one suggestion at a time. No bulk management.
- Blocks: Large suggestion queues require many individual clicks.
- Recommendation: Add checkbox selection, bulk accept/reject, bulk driver assignment.

## Test Coverage Gaps

**Session Expiry Logic:**
- What's not tested: App.tsx SESSION_DURATION timer, localStorage expiry check
- Files: `src/App.tsx` (lines 33-39, 60-61)
- Risk: Expiry might not trigger, allowing sessions past 8 hours. Or might expire prematurely.
- Priority: High

**Authentication Flow:**
- What's not tested: Login username→email mapping, Supabase auth error handling, service key missing fallback
- Files: `src/pages/Login/index.tsx`, `src/lib/supabase.ts`
- Risk: Wrong email format could prevent login. Missing service key silently fails user creation.
- Priority: High

**Real-time Subscription Reconnection:**
- What's not tested: Behavior when Supabase subscription drops/reconnects
- Files: `src/pages/Orders/index.tsx`, `src/pages/Operational/index.tsx`, and all real-time channels
- Risk: App may show stale data if subscription fails silently
- Priority: High

**Alert Deduplication Edge Cases:**
- What's not tested: Alert firing when order changes status mid-alert, rapid order creation/deletion with alerts
- Files: `src/components/AlertSystem/index.tsx`
- Risk: Duplicate alerts or missed alerts under edge conditions
- Priority: Medium

**iFood Integration Credential Validation:**
- What's not tested: Malformed credentials (too short, wrong format), network error during credential test
- Files: `src/lib/ifood.ts`, `src/pages/Integrations/index.tsx`
- Risk: User saves invalid credentials, then polling fails silently
- Priority: Medium

**Order Form Normalization:**
- What's not tested: Edge cases like zero-price items, negative quantities, missing address fields
- Files: `src/components/OrderForm/index.tsx` (lines 64-113)
- Risk: Malformed orders created in database
- Priority: Medium

---

*Concerns audit: 2026-04-09*
