# Codebase Structure

**Analysis Date:** 2026-04-09

## Directory Layout

```
hamburgueria-dispatch/
├── src/                              # React + TypeScript frontend
│   ├── main.tsx                      # React app entry point
│   ├── App.tsx                       # Root component, auth, page routing
│   ├── index.css                     # Global styles
│   ├── App.css                       # App layout styles
│   ├── vite-env.d.ts                 # Vite type definitions
│   ├── types/
│   │   └── index.ts                  # Domain types (Order, Driver, User, etc.)
│   ├── lib/
│   │   ├── supabase.ts               # Supabase client factory (anon + admin)
│   │   └── ifood.ts                  # iFood API integration
│   ├── components/
│   │   ├── AlertSystem/              # Order delay alert notifications
│   │   │   ├── index.tsx             # Alert polling + UI
│   │   │   └── AlertSystem.css       # Toast styles
│   │   ├── IfoodPoller/              # Background iFood sync component
│   │   │   └── index.tsx             # Polling loop + status indicator
│   │   ├── OrderForm/                # Order creation/edit modal
│   │   │   ├── index.tsx             # Form logic
│   │   │   └── OrderForm.css         # Modal styles
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx           # Navigation sidebar with icons
│   │   │   └── Sidebar.css           # Sidebar styles + icon spacing
│   │   └── ui/                       # Unused placeholder
│   ├── pages/
│   │   ├── Login/                    # Authentication page
│   │   │   ├── index.tsx             # Username/password form
│   │   │   └── login.css             # Login page styles
│   │   ├── Operational/              # Live order dispatch + routing
│   │   │   ├── index.tsx             # Suggestions, driver assignment
│   │   │   ├── OperationalMap.tsx    # Leaflet map with order markers
│   │   │   └── Operational.css       # Dispatch panel styles
│   │   ├── Orders/                   # Order list view
│   │   │   ├── index.tsx             # Orders table, platform filtering
│   │   │   └── Orders.css            # Table + card styles
│   │   ├── Drivers/                  # Driver CRUD
│   │   │   ├── index.tsx             # Driver list, add/delete
│   │   │   └── Drivers.css           # List + modal styles
│   │   ├── Users/                    # User CRUD (owner/admin only)
│   │   │   ├── index.tsx             # User list, add/edit/delete
│   │   │   └── Users.css             # List + form styles
│   │   ├── Integrations/             # Platform credentials management
│   │   │   ├── index.tsx             # iFood/Keeta/99Food/Web forms
│   │   │   └── Integrations.css      # Card grid + form styles
│   │   └── Dev/                      # Development utilities
│   │       ├── index.tsx             # Debug tools, manual sync trigger
│   │       └── Dev.css               # Utility panel styles
│   ├── hooks/                        # Empty (no custom hooks)
│   ├── stores/                       # Empty (no state management lib)
│   └── assets/
│       └── react.svg                 # Placeholder icon
├── src-tauri/                        # Rust/Tauri backend
│   ├── src/
│   │   ├── main.rs                   # Tauri window entry, plugin init
│   │   └── lib.rs                    # Plugin setup, greet command
│   ├── Cargo.toml                    # Rust dependencies, build config
│   └── build.rs                      # Tauri build script
├── public/                           # Static assets (copied to dist)
│   └── vite.svg                      # Favicon
├── dist/                             # Build output (generated)
├── node_modules/                     # Dependencies (generated)
├── package.json                      # npm scripts, dependencies
├── package-lock.json                 # Dependency lock file
├── tsconfig.json                     # TypeScript config
├── tsconfig.node.json                # TypeScript config for vite/build
├── vite.config.ts                    # Vite bundler config
├── index.html                        # HTML entry point
├── .env                              # Environment variables (secrets ignored)
├── .gitignore                        # Git exclusions
├── README.md                         # Project description
└── SECURITY_FIX_PROMPTS.md           # Security/auth notes
```

## Directory Purposes

**src/:**
- Purpose: All React + TypeScript frontend code
- Contains: Components, pages, services, types, styles
- Key files: `main.tsx` (entry), `App.tsx` (root component), `index.tsx` files in pages/components

**src/lib/:**
- Purpose: Service layer / API integrations
- Contains: Supabase client factory, iFood API wrapper
- Key files: `supabase.ts` (dual-key client), `ifood.ts` (sync + test functions)

**src/components/:**
- Purpose: Reusable UI components and background systems
- Contains: AlertSystem (polling + toasts), IfoodPoller (status indicator), OrderForm (modal), Sidebar (nav)
- Key files: Each has `index.tsx` (logic) + `.css` (styles)

**src/pages/:**
- Purpose: Feature screens (each page = feature domain)
- Contains: Login, Operational (dispatch), Orders (list), Drivers (CRUD), Users (CRUD), Integrations (credentials), Dev (debug)
- Key files: Each has `index.tsx` (page logic) + `.css` (page styles)

**src/types/:**
- Purpose: Centralized TypeScript interfaces and enums
- Contains: Order, Driver, User, Store, DispatchSuggestion, Platform, UserRole, OrderStatus
- Key files: `index.ts` (all types in one file)

**src-tauri/:**
- Purpose: Desktop shell, Rust runtime, system integration
- Contains: Tauri builder, plugin initialization, command handlers
- Key files: `main.rs` (entry), `lib.rs` (builder/plugins), `Cargo.toml` (Rust dependencies)

**public/:**
- Purpose: Static assets served by Vite dev server and copied to dist
- Contains: Favicon, any static images/icons
- Key files: `vite.svg`

## Key File Locations

**Entry Points:**
- `src/main.tsx`: React root mount point, creates ReactDOM.render
- `index.html`: HTML shell with `<div id="root"></div>` and script tag
- `src/App.tsx`: App component with auth + page routing logic
- `src-tauri/src/main.rs`: Tauri window launcher

**Configuration:**
- `tsconfig.json`: TypeScript compiler options (strict mode, lib: ES2020 + DOM)
- `vite.config.ts`: Vite dev server config (port 1420, React plugin, Tauri watch exclusion)
- `package.json`: npm scripts (`npm run tauri dev`, `npm run build`), dependencies
- `.env`: Environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_SERVICE_KEY)

**Core Logic:**
- `src/App.tsx`: Auth state, session expiry, role-based page access, 8-hour session timer
- `src/lib/supabase.ts`: Dual Supabase client (anon key for queries, service key for admin operations)
- `src/lib/ifood.ts`: iFood sync wrapper with Tauri HTTP plugin fallback
- `src/components/AlertSystem/index.tsx`: Order age polling (every 20s), alert threshold logic, audio playback
- `src/components/IfoodPoller/index.tsx`: iFood sync polling (every 30s), integration status check

**Testing:**
- No test files present (testing not implemented)

## Naming Conventions

**Files:**
- Pages: `src/pages/{Feature}/index.tsx` (e.g., `Orders/index.tsx`)
- Components: `src/components/{Name}/index.tsx` + `src/components/{Name}/{Name}.css`
- Services: `src/lib/{service}.ts` (camelCase, e.g., `supabase.ts`, `ifood.ts`)
- Styles: `{ComponentName}.css` co-located with component
- Types: Single file `src/types/index.ts` (barrel export)

**Directories:**
- Features as PascalCase folders: `pages/Orders/`, `pages/Operational/`, `pages/Login/`
- Service/lib folders as lowercase: `lib/`, `components/`
- Component subfolders as PascalCase matching component name: `components/AlertSystem/`, `components/OrderForm/`

**Functions:**
- React components: PascalCase (e.g., `AlertCard`, `OrderForm`, `Sidebar`)
- Utility functions: camelCase (e.g., `formatCurrency()`, `shortAddress()`, `playSound()`)
- Event handlers: `handle{Action}` pattern (e.g., `handleLogin()`, `handleNavigate()`)
- Hook-like functions: Leading use convention in component state setup (e.g., `useEffect(() => { ... })`)

**Constants:**
- Config constants: UPPERCASE_SNAKE_CASE (e.g., `POLL_INTERVAL_MS`, `SESSION_DURATION`, `WARNING_MS`)
- Lookup/config objects: PascalCase (e.g., `PLATFORM_COLORS`, `STATUS_LABELS`, `PLATFORM_DEFS`)

**Types & Interfaces:**
- Interfaces: PascalCase, usually singular (e.g., `Order`, `Driver`, `User`, `DispatchSuggestion`)
- Union types: camelCase (e.g., `type Page = 'operational' | 'orders'`)
- Enums: Not used; union types preferred (e.g., `type Platform = 'ifood' | '99food'`)

## Where to Add New Code

**New Feature (e.g., Analytics Page):**
- Primary code: `src/pages/Analytics/index.tsx` + `src/pages/Analytics/Analytics.css`
- Navigation: Add button in `src/components/layout/Sidebar.tsx`
- Route type: Add to `export type Page = '...' | 'analytics'` in `src/App.tsx`
- Access control: Add guard in `handleNavigate()` if owner-only
- Tests: Would go in `src/pages/Analytics/Analytics.test.tsx` (not currently done)

**New Service/Integration (e.g., DeliveryCo API):**
- Implementation: `src/lib/deliveryco.ts`
- Export functions: `async function syncDeliveryCo(storeId: string): Promise<Result>`
- Use Tauri HTTP like iFood: import `fetch as tauriFetch` from `@tauri-apps/plugin-http`
- Call from page or component using same pattern as `syncIfood()`

**New Component (e.g., OrderStatusBadge):**
- Location: `src/components/OrderStatusBadge/index.tsx`
- Styles: `src/components/OrderStatusBadge/OrderStatusBadge.css`
- Props interface above component definition
- Export as default

**Utilities/Helpers:**
- Formatting: `src/lib/formatting.ts` (e.g., `formatCurrency`, `formatTime`)
- Constants: `src/lib/constants.ts` or inline in relevant file
- Type guards: Add to `src/lib/guards.ts` if reused across pages

**New Page Type/Data Model:**
- Add to `src/types/index.ts` as new interface
- Update any CRUD pages that reference it
- Add color/label maps if it's a platform/status with visual representation

## Special Directories

**dist/:**
- Purpose: Build output directory
- Generated: Yes (built via `npm run build`)
- Committed: No (in .gitignore)
- Contains: Compiled JS, CSS, HTML ready for deployment

**node_modules/:**
- Purpose: npm dependencies
- Generated: Yes (created by `npm install`)
- Committed: No (in .gitignore)
- Contains: All npm packages including React, Vite, Tauri, Supabase

**src-tauri/target/:**
- Purpose: Rust build output
- Generated: Yes (created by `cargo build`)
- Committed: No (in .gitignore)
- Contains: Compiled Tauri app, debug binaries, build artifacts

**.vscode/:**
- Purpose: VS Code workspace settings
- Generated: No (committed)
- Contains: Recommended extensions, debug config, editor settings

**public/:**
- Purpose: Static assets copied to dist root
- Generated: No (manual additions)
- Committed: Yes
- Contains: Favicon, static images not imported by JS

---

*Structure analysis: 2026-04-09*
