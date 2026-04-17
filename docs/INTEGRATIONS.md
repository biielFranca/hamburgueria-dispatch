# External Integrations

**Analysis Date:** 2026-04-09

## APIs & External Services

**Food Delivery Platforms:**
- iFood (Merchant API) - Receives delivery orders automatically
  - SDK/Client: Custom HTTP wrapper using Tauri's HTTP plugin
  - Implementation: `src/lib/ifood.ts` - Calls Supabase Edge Function
  - Auth: Client ID and Client Secret stored in `store_integrations` table
  - Features: Order sync, credential validation, event polling
  - Polling: 30-second interval via `src/components/IfoodPoller/index.tsx`
  - Integration page: `src/pages/Integrations/index.tsx`

**Planned/Future Platforms:**
- Keeta (In development - disabled UI)
- 99Food (In development - disabled UI)
- Cardápio Web (In development - disabled UI)

## Data Storage

**Databases:**
- Supabase PostgreSQL - Primary database
  - Connection: Via `@supabase/supabase-js` client
  - Client: `src/lib/supabase.ts` - createClient() with URL and anonymous key
  - Tables accessed:
    - `users` - User accounts, roles, store assignments
    - `stores` - Store metadata and location data
    - `orders` - Order details, items, customer info, platform tracking
    - `drivers` - Driver roster per store
    - `dispatch_suggestions` - Routing suggestions and dispatch history
    - `store_integrations` - Integration credentials and configuration

**File Storage:**
- Not detected - Icons stored locally in `public/` directory

**Caching:**
- Not detected - Client-side state management via React useState/useRef
- Real-time updates via Supabase PostgRES Change subscription

## Authentication & Identity

**Auth Provider:**
- Supabase Auth - Custom email/password authentication
  - Implementation: 
    - Login flow: Username lookup → email derived as `{username}@dispatch.internal` → signInWithPassword()
    - Session management: 8-hour expiration tracked in localStorage
    - Automatic logout when expired
  - Client setup: `src/lib/supabase.ts`
  - Login page: `src/pages/Login/index.tsx`
  - Admin operations: Service role key available for user management
  - Role-based access control: owner, admin, operator roles stored in `users.role` table field

**Session Management:**
- localStorage key: `dispatch_login_at` - Timestamp for 8-hour session expiry
- Supabase auth session state from `supabase.auth.getSession()` and `onAuthStateChange()` listener

## Monitoring & Observability

**Error Tracking:**
- Not detected - Errors logged to browser console and displayed in UI

**Logs:**
- Console logging in component error handlers
- iFood sync status displayed in status indicator: `src/components/IfoodPoller/index.tsx`
  - Shows last sync time or last error message

**Application Health:**
- Status dot indicator (green/orange/red) for iFood polling status
- Error tracking in `store_integrations.last_error` and `last_sync_at` fields

## CI/CD & Deployment

**Hosting:**
- Windows desktop via Tauri 2
- Self-contained installer and portable executable
- No remote server deployment detected

**CI Pipeline:**
- Not detected - Manual local builds via `tauri build`

**Build Targets:**
- Windows executable (WebView2 runtime)
- Bundle includes: installer (.msi), portable executable, icons, updater manifest

## Environment Configuration

**Required env vars:**
- `VITE_SUPABASE_URL` - Project URL (e.g., https://xxxxx.supabase.co)
- `VITE_SUPABASE_ANON_KEY` - Public API key for browser/client

**Optional env vars:**
- `VITE_SUPABASE_SERVICE_KEY` - Service role key (admin operations only)
  - Enables user management in `src/pages/Users/index.tsx`
  - Creates/updates auth users when not present

**Secrets location:**
- `.env` file in `hamburgueria-dispatch/` directory (not tracked in git)
- Local development only - secrets must be configured per developer/environment

## Webhooks & Callbacks

**Incoming:**
- iFood merchant webhook endpoints managed via Edge Function `ifood-sync`
- Supabase Edge Function: `{VITE_SUPABASE_URL}/functions/v1/ifood-sync`
  - Called by `src/lib/ifood.ts` functions
  - Accepts POST requests with Supabase API key auth
  - Expected responses: `{ ok: boolean, error?: string, inserted?: number, events?: number }`

**Outgoing:**
- Not detected - Application polls iFood via Supabase Edge Function

## Supabase Edge Functions

**ifood-sync:**
- Purpose: Syncs iFood orders and events to database
- Invocation: `src/lib/ifood.ts` exports `syncIfood(storeId)` and `testIfoodCredentials(clientId, clientSecret)`
- Response format: `IfoodSyncResult { inserted: number, events: number, errors: string[] }`
- Used by: `src/components/IfoodPoller/index.tsx` (polling every 30s) and integration testing page

## Real-Time Features

**Supabase PostgRES:**
- Orders table subscription in `src/pages/Orders/index.tsx`
  - Channel: `orders-changes`
  - Event: all changes ('*') on public.orders table
  - Behavior: Re-fetches all orders when ANY change occurs
  - Pattern: Subscribe on mount, unsubscribe on unmount

**User Role Sync:**
- User role fetched from `users` table after auth login
- Updates propagated via `onAuthStateChange()` listener

## Data Flow

**Order Ingestion:**
1. iFood merchant sends webhook to Supabase Edge Function
2. Edge Function validates credentials and calls iFood Merchant API
3. Orders inserted/updated in `orders` table
4. IfoodPoller component detects changes via subscription
5. Orders displayed in Orders page with real-time updates

**User Login:**
1. User enters username/password in Login page
2. System queries `users` table for matching username
3. Constructs email: `{username}@dispatch.internal`
4. Calls `supabase.auth.signInWithPassword()`
5. Session stored + role fetched from users table
6. 8-hour expiration timer started

**Integration Configuration:**
1. Owner/admin navigates to Integrations page
2. Selects platform (iFood) and enters credentials
3. Credentials saved to `store_integrations` table
4. Test function calls Edge Function to validate
5. When active=true, IfoodPoller automatically starts syncing

---

*Integration audit: 2026-04-09*
