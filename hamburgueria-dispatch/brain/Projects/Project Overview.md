# Project Overview

## Summary
Hamburgueria Dispatch is a Windows desktop application for managing food delivery dispatch operations. It receives orders from food platforms (iFood, 99Food, Keeta, Cardápio Web), classifies them logistically, groups them into optimal delivery routes, and dispatches drivers.

## Source
- `hamburgueria-dispatch/` — main codebase
- `tasks_v1.md` — v1 task definitions
- `task-log.md` — execution history
- `.planning/codebase/ARCHITECTURE.md`

## Purpose
Eliminate manual dispatch coordination for food delivery stores. The app centralizes order intake, route optimization, and driver assignment in a single desktop dashboard for operators.

## Current Scope

### Implemented (v1 — all 64 tasks completed)
- Multi-platform order ingestion (iFood live, others in development)
- Logistic classifier with 5 rules + default (eligible/blocked/awaiting/external_monitoring)
- Route engine: pairs 2 orders optimally using external routing API, creates dispatch suggestions
- Dispatch panel (Operational page): map view, driver assignment, accept/reject suggestions
- Alert system: time-based warnings at 5min, 1min, and overdue thresholds with audio
- Settings page: store config with Leaflet map, CEP auto-fill
- User management with role-based access (owner/admin/operator) + per-page permissions
- iFood integration with OAuth token caching and 30s polling
- CEP auto-fill in order form and store settings via ViaCEP API

### Not in scope (v1)
- Offline support
- Driver GPS tracking
- Push/desktop notifications
- Order history/audit trail
- Batch accept/reject operations

## Major Modules
- **Classifier** (`src/lib/classifier.ts` + `src/components/ClassifierService/`) — classifies incoming orders
- **Route Engine** (`src/lib/routeEngine.ts` + `src/components/RouteEngineService/`) — generates dispatch suggestions
- **Alert System** (`src/components/AlertSystem/`) — time-based order alerts with audio
- **iFood Integration** (`src/lib/integrations/ifood.ts` + `src/components/IfoodPoller/`) — order sync
- **Open Delivery** (`src/lib/integrations/openDelivery.ts`) — 99Food, Keeta, Cardápio Web (partial)
- **Operational** (`src/pages/Operational/`) — main dispatch UI with map
- **Orders** (`src/pages/Orders/`) — order list with real-time updates
- **Settings** (`src/pages/Settings/`) — 3-tab settings: General, Connections, Plan

## Important Workflows
1. Order ingestion: platform webhook → Supabase Edge Function → `orders` table → Classifier → `awaiting_route`
2. Route suggestion: Route Engine polls `eligible` orders → pairs them → inserts `dispatch_suggestion`
3. Dispatch: Operator accepts suggestion + selects driver → status `dispatched`
4. Alerts: AlertSystem polls orders every 20s → fires audio + visual alerts by age

## Current State
v1 shipped and functional. No automated tests. Known security issues (service key in frontend, no plaintext passwords fixed yet). Performance improvements planned.

## Known Unfinished Areas
- Open Delivery integrations (99Food, Keeta, Cardápio Web) — UI hidden, lib exists
- Offline support — not started
- Automated test suite — not started
- Driver tracking — not started
- Order history/audit trail — not started

## Related Notes
- [[System Architecture]]
- [[Decision Log]]
- [[Pending Work Register]]
- [[Roadmap]]
