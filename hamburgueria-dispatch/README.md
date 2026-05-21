# Hamburgueria Dispatch

Desktop operations hub for hamburger restaurants. Manages order intake from multiple delivery platforms (iFood, Keeta, 99Food), dispatches delivery drivers, and provides real-time operational visibility.

## Overview

A Tauri 2 desktop app running natively on Windows. Operators see live orders, assign drivers to routes, manage the menu, and configure platform integrations — all from a single window without requiring a browser.

## Current Stack

| Layer | Technology | Version |
|---|---|---|
| Desktop shell | Tauri | 2.x |
| Frontend | React | 19 |
| Language | TypeScript | 5.8 |
| Backend/DB | Supabase | 2.x |
| Mapping | Leaflet + react-leaflet | 1.x / 5.x |
| Routing | React Router | 7.x |
| Build | Vite | 7.x |
| Bundler (Rust) | Cargo | — |

## Architecture Decisions

### Why Tauri (and why 2.x specifically)
Tauri gives a native Windows executable with WebView2 rendering — no Electron overhead, no browser tab management, and full access to the OS when needed. Tauri 2 is the current stable release with a stabilized plugin API; the project targets 2.x exclusively.

### Why Supabase (and why it stays for now)
Supabase provides auth, Postgres, realtime subscriptions, and Edge Functions out of the box, with no infrastructure to manage. The current feature set — orders, drivers, users, store settings, platform integrations — is well served by this. Migrating early would slow down delivery without architectural benefit.

### Why a custom Bun backend is planned but not built yet
V1 and V2 of the product will not outgrow Supabase. A custom backend (Bun + Hono or Elysia) becomes relevant when the product needs business logic that cannot run in Edge Functions, multi-tenant orchestration, or advanced webhook processing. That is a V3+ decision.

### Why not React Native for the motoboy app
The driver-side mobile experience is deferred. When it becomes a priority, Tauri Mobile will be evaluated as the first option before defaulting to React Native, keeping the tech stack consistent.

## Project Structure

```
hamburgueria-dispatch/
├── src/
│   ├── components/          # Shared components and background services
│   │   ├── AlertSystem/     # Real-time alert poller and sound notifications
│   │   ├── ClassifierService/  # Automatic order classification engine
│   │   ├── IfoodPoller/     # iFood order polling loop
│   │   ├── OpenDeliveryPoller/ # Open Delivery protocol poller
│   │   ├── OrderForm/       # Manual order creation form
│   │   ├── RouteEngineService/ # Route optimization background service
│   │   └── layout/          # Sidebar navigation
│   ├── lib/                 # Utilities and integration clients
│   │   ├── supabase.ts      # Supabase client (single source of truth)
│   │   ├── integrations/    # iFood and Open Delivery API clients
│   │   ├── classifier.ts    # Order classification logic
│   │   ├── geocoder.ts      # Address geocoding
│   │   ├── routeEngine.ts   # Route suggestion engine
│   │   ├── cep.ts           # Brazilian zip code lookup
│   │   └── alertSound.ts    # Audio alert playback
│   ├── services/            # Data access layer (Supabase-backed, backend-agnostic interface)
│   │   ├── auth.ts          # Auth operations
│   │   ├── orders.ts        # Order CRUD and realtime subscriptions
│   │   ├── drivers.ts       # Driver CRUD and realtime subscriptions
│   │   ├── users.ts         # User management
│   │   └── stores.ts        # Store settings and integrations
│   ├── pages/               # Application screens
│   │   ├── Operational/     # Live map + driver dispatch panel
│   │   ├── Orders/          # Order list and management
│   │   ├── Drivers/         # Driver registry
│   │   ├── Users/           # User and permission management
│   │   ├── Settings/        # Store settings and integrations config
│   │   ├── Cardapio/        # Menu management
│   │   ├── Estoque/         # Inventory
│   │   ├── Integrations/    # Platform integration status
│   │   ├── Login/           # Authentication screen
│   │   └── Dev/             # Internal developer/debug panel
│   ├── stores/              # Application state
│   └── types/               # Shared TypeScript types (index.ts)
├── src-tauri/               # Rust/Tauri configuration and native entry point
│   ├── Cargo.toml
│   └── tauri.conf.json
├── supabase/                # Supabase project config
│   ├── config.toml
│   ├── migrations/          # SQL migration files
│   └── functions/           # Edge Functions
├── brain/                   # Obsidian knowledge vault (architecture notes, decisions, plans)
├── public/                  # Static assets
└── ARCHITECTURE.md          # Architecture rationale and future backend path
```

## Setup

### Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) 20+
- [Tauri CLI v2](https://tauri.app/start/prerequisites/)
- WebView2 runtime (comes pre-installed on Windows 10/11)
- A Supabase project with the schema applied (see `supabase/migrations/`)

### Environment Variables

Create `hamburgueria-dispatch/.env` (not committed):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Install

```bash
cd hamburgueria-dispatch
npm install
```

### Local Development

```bash
npm run tauri dev
```

This opens the Tauri desktop window. Hot reload works for frontend changes. Rust changes require a full rebuild.

> **Note:** Do not use `npm run dev` alone — the app requires the Tauri window for native APIs and proper auth flow.

### Build

```bash
npm run tauri build
```

Produces a Windows installer in `src-tauri/target/release/bundle/`.

## Current Functionalities

- **Multi-platform order intake**: polls iFood and Open Delivery APIs; supports manual order entry; real-time sync via Supabase channels
- **Order classification**: automatic normalization and categorization of incoming orders
- **Operational panel**: live map (Leaflet) with driver positions and order assignments
- **Route optimization**: groups orders into optimized delivery routes; supports drag-reorder and manual override
- **Driver dispatch**: suggest routes to drivers; track dispatch status per order
- **Driver registry**: add, edit, activate/deactivate drivers
- **User management**: role-based access (owner / admin / operator) with per-feature permission flags
- **Store settings**: configure store address, coordinates, logo, and per-platform integrations
- **Alert system**: sound and visual alerts for new orders requiring attention
- **Session management**: 8-hour session expiry with automatic sign-out

## Pending Updates

- [ ] Migrate existing pages to use `src/services/` instead of calling `supabase` directly — boundary is defined, pages still import from `lib/supabase` directly
- [ ] Menu management (Cardápio) — screen exists, implementation incomplete
- [ ] Inventory management (Estoque) — screen exists, implementation incomplete
- [ ] Social media module — screen exists, not wired to data
- [ ] Driver mobile app — deferred; Tauri Mobile to be evaluated first
- [ ] Tauri Mobile evaluation for motoboy/driver-side app
- [ ] Custom backend (Bun + Hono/Elysia) — planned for V3+, no timeline yet
- [ ] Edge Functions: audit which business logic should move to `supabase/functions/` vs. stay in the frontend
- [ ] Production hardening: RLS policy audit, CSP configuration in `tauri.conf.json`
