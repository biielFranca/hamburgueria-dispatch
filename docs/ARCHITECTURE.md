# Architecture

**Analysis Date:** 2026-04-09

## Pattern Overview

**Overall:** Desktop application using Tauri 2 (Rust) + React + TypeScript, with a multi-page SPA (Single Page Application) architecture. The frontend communicates with Supabase (PostgreSQL backend + Auth) and integrates with external platforms via HTTP calls to Supabase Functions.

**Key Characteristics:**
- Layered frontend with clear separation of concerns: pages, components, lib (services), types
- Role-based access control (RBAC) enforced at the App level before rendering pages
- Real-time polling and reactive components for operational features (orders, routes, alerts)
- Tauri bridge for HTTP requests using platform-native HTTP plugin
- Supabase as both authentication provider and primary data layer
- Background "invisible" polling components (AlertSystem, IfoodPoller) that update state continuously

## Layers

**Tauri / Desktop Shell (src-tauri/):**
- Purpose: Desktop window management, plugin initialization, system integration
- Location: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Contains: Rust setup code, plugin declarations (opener, http)
- Depends on: Tauri framework 2, plugins
- Used by: React frontend via WebView2

**Authentication & Session Management (App.tsx):**
- Purpose: Auth state lifecycle, session validation, role-based page access
- Location: `src/App.tsx`
- Contains: Supabase auth listener, 8-hour session expiry check, role fetching
- Depends on: `supabase` lib, Supabase auth API
- Used by: All pages (passed as session context), Sidebar

**Page Layer (src/pages/):**
- Purpose: Feature/domain-specific UI screens
- Location: `src/pages/Operational/`, `src/pages/Orders/`, `src/pages/Drivers/`, `src/pages/Users/`, `src/pages/Integrations/`, `src/pages/Dev/`, `src/pages/Login/`
- Contains: Page-level state (useState), data fetching, form handling
- Depends on: `supabase` lib, `ifood` lib, types
- Used by: App.tsx for conditional rendering based on activePage

**Component Layer (src/components/):**
- Purpose: Reusable UI pieces and background polling
- Location: `src/components/AlertSystem/`, `src/components/IfoodPoller/`, `src/components/OrderForm/`, `src/components/layout/Sidebar.tsx`
- Contains: AlertCard, form inputs, layout shell, polling logic
- Depends on: `supabase` lib, types, CSS modules
- Used by: Pages, App root

**Service/Integration Layer (src/lib/):**
- Purpose: External API calls, platform-specific logic, centralized HTTP handling
- Location: `src/lib/supabase.ts`, `src/lib/ifood.ts`
- Contains: Supabase client initialization, iFood sync/test functions, HTTP wrapper for Tauri
- Depends on: Supabase SDK, Tauri HTTP plugin (with fallback to native fetch)
- Used by: All pages, components, App.tsx

**Type Definitions (src/types/index.ts):**
- Purpose: Domain models and enums
- Location: `src/types/index.ts`
- Contains: Platform, UserRole, OrderStatus, RouteEligibility, Order, Driver, Store, User, DispatchSuggestion interfaces
- Depends on: Nothing (pure TypeScript)
- Used by: All pages, components, services

## Data Flow

**User Login Flow:**

1. User enters username/password in `Login` page
2. `Login` queries `users` table for matching username → extracts auth_id
3. Calls `supabase.auth.signInWithPassword()` with email `{username}@dispatch.internal`
4. Supabase returns session on success
5. App.tsx's `onAuthStateChange` listener fires, sets session state
6. `fetchUserRole()` queries `users` table for role, App re-renders with Sidebar + active page
7. `localStorage` stores `dispatch_login_at` timestamp for 8-hour expiry
8. Sidebar filters available pages based on userRole (owner/admin only see Users + Integrations)

**Operational Page Data Flow:**

1. `Operational` page mounts, fetches `DispatchSuggestion` rows with nested `orders`
2. `OperationalMap` receives suggestions, renders Leaflet map with order markers
3. Driver dropdown populated from `drivers` table
4. User selects driver and "accepts" suggestion
5. Page calls Supabase RPC or direct update to mark suggestion as `dispatched`
6. Order status transitions: `in_suggestion` → `dispatched`
7. `AlertSystem` background component continuously polls `orders` table every 20s
8. When order age hits warning/urgent/overdue thresholds, plays sound and shows toast

**iFood Order Sync Flow:**

1. `IfoodPoller` component mounts
2. Calls `supabase.auth.getUser()` to get auth_id
3. Queries `users` table for `store_id`, then `store_integrations` for active iFood integration
4. Every 30s calls `syncIfood(storeId)` → calls Supabase Function `ifood-sync`
5. Function receives iFood events from Merchant API, normalizes orders, inserts into `orders` table
6. Returns inserted count, events processed, any errors
7. Status indicator shown bottom-left (green/yellow/red) with last sync time or error

**Alert System Flow:**

1. AlertSystem queries `orders` table for non-dispatched orders every 20s
2. For each order, calculates age in minutes
3. If age >= 10 min → fires `overdue` alert (if not already fired for this order-level)
4. If 9 min → fires `urgent` alert
5. If 5 min → fires `warning` alert
6. Plays audio (sine/square wave via Web Audio API) matching alert level
7. Shows toast card with auto-dismiss after 7s
8. Tracks fired alerts in `firedRef` Set to prevent duplicate alerts per order-level

**State Management:**

- Local component state via `useState` hooks (no Redux/Context)
- Session stored in Supabase (fetched on mount via `getSession()`)
- User role cached in App state, broadcast to pages
- Active page index stored in App state, drives Sidebar highlight + page rendering
- Alert cards stored in AlertSystem state with auto-cleanup
- Form inputs (Drivers, Users, Integrations pages) manage local state, sync to Supabase on submit

## Key Abstractions

**Supabase Client Factory:**
- Purpose: Centralized Supabase initialization, dual-key system (anon + admin)
- Examples: `src/lib/supabase.ts`
- Pattern: Two export constants: `supabase` (for regular queries) and `supabaseAdmin` (for user management, requires service key)

**iFood Integration Wrapper:**
- Purpose: Abstract HTTP calls to Supabase Functions for iFood sync
- Examples: `src/lib/ifood.ts`
- Pattern: Helper functions `syncIfood()`, `testIfoodCredentials()` that call Supabase Function with Tauri HTTP fallback

**Order Status & Platform Enums:**
- Purpose: Type-safe platform/status/role constants shared across app
- Examples: `Order`, `Platform = 'ifood' | '99food' | 'cardapio_web' | 'keeta'`, `UserRole = 'owner' | 'admin' | 'operator'`
- Pattern: Centralized in `types/index.ts`, used in platform color maps and form selects

**Page Component with Router-like Pattern:**
- Purpose: Single-page navigation without a library (conditional rendering)
- Examples: `App.tsx` uses `activePage` state and ternary checks to render pages
- Pattern: App maintains state, Sidebar has `onClick` to call `onNavigate(page)`, App re-renders

**Modal Pattern:**
- Purpose: Confirmation dialogs and form overlays
- Examples: `Drivers` page `ConfirmModal` component
- Pattern: Local `open` state prop, animates in/out with CSS, Escape key dismissal

## Entry Points

**Application Root:**
- Location: `src/main.tsx`
- Triggers: Tauri window ready
- Responsibilities: Mounts React app to `#root` DOM node

**App Component:**
- Location: `src/App.tsx`
- Triggers: React renders root component
- Responsibilities: Auth state init, session expiry check, page routing, role-based access, sidebar layout

**Tauri Runtime:**
- Location: `src-tauri/src/lib.rs`
- Triggers: Tauri build/launch
- Responsibilities: Initializes plugins (opener, http), sets up command handler (greet), builds window context

**Background Components:**
- AlertSystem: `src/components/AlertSystem/index.tsx` — rendered in App, mounts with setInterval for polling
- IfoodPoller: `src/components/IfoodPoller/index.tsx` — renders indicator dot, manages iFood sync polling loop

## Error Handling

**Strategy:** Try-catch blocks in async functions, error state in components, user-facing toast/modal messaging (Portuguese)

**Patterns:**

- **Auth Errors:** Login page catches `signInWithPassword` error, displays "Usuário ou senha incorretos"
- **Supabase Query Errors:** Pages check for `.error` on response, display in state or console
- **Integration Test Errors:** Integrations page catches iFood credential test, shows error modal
- **HTTP Errors:** iFood sync catches network/response errors, stores in `lastError`, shows red indicator
- **General API:** Wrapped try-catch, error message stored in component state, displayed to user

## Cross-Cutting Concerns

**Logging:**
- Approach: No structured logging library; uses `console.log/error` sparingly
- Alert system and poller track status (lastSync, lastError) in component state

**Validation:**
- Approach: Client-side validation in form handlers (e.g., "Preencha usuário e senha")
- No form validation library; manual checks with early returns

**Authentication:**
- Approach: Supabase Auth with email-based login (username + password flow)
- Email normalized to `{username}@dispatch.internal` convention
- Session persisted in localStorage for 8-hour window with checkSessionExpiry() loop
- Supabase handles token refresh internally

**Authorization:**
- Approach: Role-based page access checked in App before rendering pages
- Sidebar conditionally shows Users/Integrations buttons for owner/admin only
- Pages may also guard access (see `handleNavigate` guards)

**Error Boundaries:**
- Approach: None implemented; errors surface as exceptions or empty UI
- Risk: unhandled component errors crash the entire app

---

*Architecture analysis: 2026-04-09*
