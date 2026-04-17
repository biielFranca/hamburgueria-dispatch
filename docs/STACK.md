# Technology Stack

**Analysis Date:** 2026-04-09

## Languages

**Primary:**
- TypeScript ~5.8.3 - Used throughout frontend (React components, pages, utilities)
- JavaScript - Vite configuration and package scripts
- Rust - Tauri backend and system integration (`src-tauri/src/lib.rs`, `src-tauri/src/main.rs`)

**Secondary:**
- HTML - Application entry point and Tauri window template
- CSS - Component and page styling

## Runtime

**Environment:**
- Node.js (version via `.nvmrc` or package manager)
- Tauri 2 - Desktop application framework (Windows WebView2 target)

**Package Manager:**
- npm - Primary package manager
- Lockfile: `package-lock.json` present (tracked in git root and hamburgueria-dispatch)

## Frameworks

**Core:**
- React 19.1.0 - Frontend UI library and component framework
- React DOM 19.1.0 - React rendering layer
- React Router DOM 7.14.0 - Client-side routing and navigation
- Tauri 2 - Desktop application framework bundling React app into native Windows executable

**Testing:**
- No test framework detected

**Build/Dev:**
- Vite 7.0.4 - Frontend development server and bundler (port 1420 for Tauri)
- @vitejs/plugin-react 4.6.0 - React JSX transform plugin for Vite
- TypeScript 5.8.3 - Type checking and compilation

**Backend (Rust):**
- tauri-build 2 - Build dependencies for Tauri
- Cargo (Rust package manager) - Defined in `src-tauri/Cargo.toml`

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.102.1 - Database, auth, and real-time subscriptions
  - Used in `src/lib/supabase.ts` for both regular and admin clients
  - Handles authentication, CRUD operations, and real-time database changes
- @tauri-apps/api 2 - Core Tauri API bindings for window and system access
- @tauri-apps/plugin-http 2.5.8 - HTTP client plugin (used in iFood integration)
- @tauri-apps/plugin-opener 2 - Plugin for opening URLs in external applications

**Infrastructure:**
- @tauri-apps/cli 2 - Tauri command-line interface for development and building
- @types/react 19.1.8 - React type definitions
- @types/react-dom 19.1.6 - React DOM type definitions
- @types/leaflet 1.9.21 - Leaflet map library type definitions
- leaflet 1.9.4 - Map library (used for operational/dispatch map visualization)
- react-leaflet 5.0.0 - React wrapper for Leaflet maps

## Configuration

**Environment:**
- `.env` file present in `hamburgueria-dispatch/` (secrets and API keys - not tracked)
- Environment variables loaded via Vite's `import.meta.env.*` syntax:
  - `VITE_SUPABASE_URL` - Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (public)
  - `VITE_SUPABASE_SERVICE_KEY` - Supabase service role key (sensitive, admin operations)

**Build:**
- `vite.config.ts` - Vite configuration with React plugin, Tauri dev/build settings
- `tsconfig.json` - TypeScript compiler options (ES2020 target, bundler resolution, strict mode)
- `tsconfig.node.json` - TypeScript config for Node.js build scripts
- `tauri.conf.json` - Tauri application configuration (window size, build commands, bundle settings)
- `src-tauri/Cargo.toml` - Rust dependencies and metadata
- `src-tauri/Cargo.lock` - Locked Rust dependency versions

## Platform Requirements

**Development:**
- Node.js (LTS recommended)
- Rust toolchain (for Tauri development)
- Windows 10+ or compatible OS with WebView2

**Production:**
- Windows desktop (WebView2 runtime required)
- Tauri bundles the application as an installer and standalone executable
- Requires internet connection for Supabase connectivity

## Development Workflow

**Commands:**
- `npm run dev` - Starts Vite dev server (port 1420) and is invoked by Tauri
- `tauri dev` - Main development command (runs `npm run dev` + Tauri window)
- `npm run build` - TypeScript compilation followed by Vite production build
- `tauri build` - Builds and bundles native Windows executable
- `npm run preview` - Preview production build locally

---

*Stack analysis: 2026-04-09*
