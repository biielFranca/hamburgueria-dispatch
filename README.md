# Hamburgueria Dispatch

A real-time delivery dispatch management system for restaurants. Built as a desktop application (Tauri) with a React + TypeScript frontend and Supabase as the backend.

---

## Overview

Hamburgueria Dispatch automates and streamlines the delivery dispatch workflow for food businesses. It integrates with major Brazilian food delivery platforms (iFood, 99food, Keeta, Cardápio Web), automatically classifies incoming orders, suggests optimal delivery routes, and gives operators a live operational dashboard to manage dispatches in real time.

---

## Features

### Operational Panel
- Live map (Leaflet + OpenStreetMap) showing store location, order markers by platform, and route geometry fetched from OSRM
- Dispatch suggestion cards with predicted ETA and stop count
- Accept/reject workflow with driver assignment
- Edit suggestions: add/remove orders, drag-to-reorder stops, auto route re-optimization via OSRM
- In-progress tab with live countdown timers per route
- Finalized tab with driver and customer names for dispatched/delivered/cancelled orders

### Route Engine
- Groups up to **3 orders per suggestion** using geographic proximity scoring (`haversine_nearest_neighbor / num_stops`)
- Evaluates all permutations in parallel via OSRM to find the shortest sequence
- Falls back to nearest-neighbor heuristic when OSRM is unavailable
- Solo-order wait timer (configurable via `VITE_SOLO_WAIT_MIN`, default 10 min)
- Timeout handling: after 3 rejections, order is marked `dispatch_timeout`

### Order Classifier
- Rule-based pipeline: pickup block → platform logistics → missing coordinates → invalid address → scheduled delivery
- Geocodes addresses via Nominatim when coordinates are missing
- Batch-processes all `normalized` orders on each trigger to prevent race conditions

### Platform Integrations
| Platform | Protocol | Logistics |
|---|---|---|
| iFood | iFood API (OAuth 2.0, 30s polling) | Own fleet |
| 99food | Open Delivery | Own fleet |
| Keeta | Open Delivery | Platform-managed (never dispatched by us) |
| Cardápio Web | Open Delivery | Own fleet |

### Alert System
- Polling every 20 seconds for orders approaching the 10-minute dispatch SLA
- Three alert levels: warning (5 min), urgent (1 min before SLA), overdue (past SLA)
- Audio alerts via Web Audio API with mute toggle and persistent state
- Toast notifications with auto-dismiss and progress bar

### Order Management
- Filterable order list by platform and status
- Manual order creation with CEP auto-fill (ViaCEP API)

### Driver Management
- Driver CRUD with active/inactive toggle

### User Management (owner/admin only)
- Role-based access control: `owner`, `admin`, `operator`
- Per-user page permissions: operational, orders, drivers

### Settings
- Store configuration: name, address, phone, geolocation (with interactive Leaflet map picker)
- Platform connection management
- Plan information

### Dev Tools (owner only)
- Manual iFood sync trigger
- Force route engine run with outcome logging
- Test order creation with configurable prep time
- Clear test orders / clear suggestion queue

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri v2](https://tauri.app) (Rust) |
| Frontend framework | [React 19](https://react.dev) + [TypeScript 5.8](https://www.typescriptlang.org) |
| Build tool | [Vite 7](https://vite.dev) |
| Backend / DB | [Supabase](https://supabase.com) (PostgreSQL + Realtime + Edge Functions) |
| Map | [Leaflet 1.9](https://leafletjs.com) + [react-leaflet 5](https://react-leaflet.js.org) |
| Routing API | [OSRM](https://project-osrm.org) (self-hosted or public endpoint) |
| Geocoding | [Nominatim](https://nominatim.org) (OpenStreetMap) |
| CEP lookup | [ViaCEP](https://viacep.com.br) |
| HTTP (Tauri) | `@tauri-apps/plugin-http` |
| Styling | Plain CSS modules (no CSS framework) |

---

## Requirements

- **Node.js** ≥ 20
- **npm** ≥ 10
- **Rust** + **Cargo** (for Tauri desktop build only)
- **Tauri CLI v2** (`npm install -g @tauri-apps/cli`)
- A **Supabase** project with:
  - Tables: `stores`, `orders`, `drivers`, `users`, `dispatch_suggestions`, `dispatch_suggestion_orders`, `dispatch_alerts`
  - Realtime enabled on `orders` and `dispatch_suggestions`
  - Edge Functions: `ifood-sync`, `open-delivery-webhook`, `open-delivery-dispatch-confirm`, `open-delivery-sync`
- An **OSRM** endpoint (default: public `router.project-osrm.org`)

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/biielfranca/hamburgueria-dispatch.git
cd hamburgueria-dispatch

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your values
```

### Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Optional — defaults shown
VITE_ROUTES_API_URL=https://router.project-osrm.org
VITE_OSRM_PROFILE=driving
VITE_SOLO_WAIT_MIN=10
```

> **Security:** Never expose a Supabase service key in the frontend. All privileged operations run via Edge Functions with the anon key.

---

## Running the Project

### Web (browser dev server)
```bash
npm run dev
# → http://localhost:1420
```

### Desktop (Tauri)
```bash
npm run tauri dev
```

### Production build (web)
```bash
npm run build
```

### Production build (desktop)
```bash
npm run tauri build
```

---

## Development Notes

- **Background services** (`ClassifierService`, `IfoodPoller`, `RouteEngineService`) are React components mounted in `App.tsx` that run polling loops and Supabase Realtime subscriptions silently.
- **Route engine mutex**: `engineRunning` flag in `routeEngine.ts` prevents concurrent suggestion generation.
- **Classifier batch pattern**: The Realtime INSERT handler delegates to `classifyPendingOrders()` (not a single-order inline flow) to avoid premature engine triggers when multiple orders arrive simultaneously.
- **OSRM permutations**: For 3 orders, 6 permutations are evaluated in parallel. Keep `MAX_GROUP ≤ 4` to avoid excessive API calls.
- **Platform logistics**: Keeta orders are always `external_monitoring` — they never enter the dispatch queue.
- **CEP auto-fill**: Available in the order form; uses ViaCEP and fills street, neighborhood, and city automatically.

---

## Project Structure

```
hamburgueria-dispatch/
├── src/                         # React + TypeScript frontend
│   ├── main.tsx                 # React DOM entry point
│   ├── App.tsx                  # Root component: auth, routing, background services
│   ├── index.css                # Global styles
│   ├── App.css                  # App layout styles
│   ├── vite-env.d.ts            # Vite type shims
│   │
│   ├── types/
│   │   └── index.ts             # All domain types (Order, Driver, Store, Platform…)
│   │
│   ├── lib/                     # Core business logic
│   │   ├── supabase.ts          # Supabase client (anon key only)
│   │   ├── classifier.ts        # Order classification rules + batch processor
│   │   ├── routeEngine.ts       # Route optimization, OSRM queries, suggestion creation
│   │   ├── geocoder.ts          # Address → coordinates (Nominatim)
│   │   ├── cep.ts               # CEP → address (ViaCEP)
│   │   ├── alertSound.ts        # Audio alert engine (Web Audio API)
│   │   ├── ifood.ts             # iFood sync via Edge Function
│   │   └── integrations/
│   │       ├── ifood.ts         # iFood OAuth 2.0 polling + event processing
│   │       └── openDelivery.ts  # 99food / Keeta / Cardápio Web integration
│   │
│   ├── components/              # Reusable UI components
│   │   ├── AlertSystem/         # Delay alert toasts + audio
│   │   ├── ClassifierService/   # Background order classifier
│   │   ├── IfoodPoller/         # Background iFood sync
│   │   ├── RouteEngineService/  # Background route engine trigger
│   │   ├── OrderForm/           # Order creation/edit modal
│   │   └── layout/
│   │       └── Sidebar.tsx      # Navigation sidebar
│   │
│   └── pages/
│       ├── Login/               # Authentication
│       ├── Operational/         # Live dispatch panel + map
│       ├── Orders/              # Order list and filtering
│       ├── Drivers/             # Driver CRUD
│       ├── Users/               # User management (owner/admin)
│       ├── Settings/            # Store config + platform connections
│       └── Dev/                 # Developer tools (owner only)
│
├── src-tauri/                   # Tauri desktop shell (Rust)
│   ├── src/main.rs              # Tauri entry point
│   ├── src/lib.rs               # Plugin initialization
│   ├── tauri.conf.json          # App configuration
│   ├── Cargo.toml               # Rust dependencies
│   └── icons/                   # App icons
│
├── public/                      # Static assets served as-is
├── docs/                        # Project documentation
│   ├── ARCHITECTURE.md          # System design decisions
│   ├── CONVENTIONS.md           # Code style and naming patterns
│   ├── INTEGRATIONS.md          # Platform integration specs
│   ├── STACK.md                 # Tech stack rationale
│   ├── CONCERNS.md              # Known risks and technical debt
│   ├── TESTING.md               # Testing strategy
│   ├── SECURITY_REVIEW.md       # Security audit findings and fixes
│   ├── task-log.md              # Completed task history
│   └── tasks_v1.md              # Original task specification
│
├── .env.example                 # Environment variable template
├── .vscode/extensions.json      # Recommended VS Code extensions
├── index.html                   # HTML entry point
├── package.json                 # npm scripts and dependencies
├── tsconfig.json                # TypeScript configuration
├── tsconfig.node.json           # TypeScript config for build tooling
└── vite.config.ts               # Vite bundler configuration
```

---

## Pending Updates

Based on evidence found in the codebase:

| Area | Item |
|---|---|
| **Testing** | No test suite exists. Zero `.test.ts` / `.spec.ts` files. Unit tests for `classifier.ts` and `routeEngine.ts` are critical. |
| **Platform APIs** | iFood, 99food, and Keeta API credentials require commercial partnership agreements — not yet set up. |
| **Cardápio Web** | Two API options exist (native integration API vs Open Delivery). Currently mapped to Open Delivery; native API features (menu sync, store pause) not integrated. |
| **OSRM** | Using public `router.project-osrm.org` endpoint (rate-limited, unreliable for production). Should be self-hosted or replaced with a commercial routing API. |
| **Supabase migrations** | No `supabase/migrations/` folder — schema is managed manually via dashboard. Should be version-controlled. |
| **Push notifications** | `PushNotification` tool appears in context but is not implemented. |
| **Driver location tracking** | Map shows store and order markers but no live driver position tracking. |
| **Delivery confirmation** | Orders reach `dispatched` status but `delivered` must be confirmed manually or via platform webhook — no automatic delivery confirmation flow. |
| **Multi-store** | Architecture references `store_id` throughout, but the UI has no store-switching feature. |
| **Offline mode** | No offline handling — if Supabase or OSRM is unreachable, the app silently degrades. |

---

## Notes

- All integration calls to platforms are proxied through **Supabase Edge Functions** — no platform secrets are exposed to the frontend.
- The Tauri desktop shell is optional. The app runs fully in a browser via `npm run dev`; Tauri adds a native window and uses `@tauri-apps/plugin-http` for HTTP requests inside the desktop build.
- Role `owner` has full access. Role `admin` can manage users. Role `operator` has configurable page-level permissions set by an owner/admin.
- The alert SLA threshold is hardcoded at 10 minutes in `AlertSystem/index.tsx` — make it configurable per store if needed.
