# Coding Conventions

**Analysis Date:** 2026-04-09

## Naming Patterns

**Files:**
- Components: PascalCase with `index.tsx` (e.g., `AlertSystem/index.tsx`, `OrderForm/index.tsx`)
- Pages: PascalCase directories (e.g., `pages/Orders/index.tsx`, `pages/Operational/index.tsx`)
- Utilities/libs: camelCase (e.g., `supabase.ts`, `ifood.ts`)
- CSS files: Match component name (e.g., `AlertSystem.css`, `OrderForm.css`)

**Functions:**
- Component functions: PascalCase (e.g., `AlertSystem`, `OrderCard`, `SuggestionBlock`)
- Helper functions: camelCase (e.g., `formatCurrency`, `formatTime`, `shortAddress`)
- Event handlers: camelCase with prefix (e.g., `handleAccept`, `handleReject`, `handleSubmit`, `onSelect`, `onClose`)
- Async functions: camelCase (e.g., `fetchOrders`, `fetchAll`, `syncIfood`)
- Boolean validators: camelCase with `check` or `is`/`has` prefix (e.g., `checkSessionExpiry`, `checkOrders`)

**Variables:**
- State variables: camelCase (e.g., `orders`, `loading`, `selectedOrder`)
- Refs: camelCase with `Ref` suffix (e.g., `storeIdRef`, `firedRef`, `firstInputRef`)
- Configuration constants: UPPER_SNAKE_CASE (e.g., `SESSION_DURATION`, `POLL_INTERVAL_MS`, `WARNING_MS`, `DISPATCH_GHOST_MS`)
- Maps/lookup objects: UPPER_SNAKE_CASE (e.g., `PLATFORM_COLORS`, `PLATFORM_LABELS`, `STATUS_LABELS`)
- Local type discriminants: UPPER_SNAKE_CASE (e.g., `PLATFORMS`)

**Types:**
- Interfaces: PascalCase (e.g., `Order`, `Driver`, `Store`, `AlertItem`, `FormState`)
- Type aliases: PascalCase (e.g., `Page`, `UserRole`, `Platform`, `OrderStatus`, `AlertLevel`)
- Union types: lowercase literal strings (e.g., `'delivery' | 'pickup'`, `'ifood' | '99food'`)

## Code Style

**Formatting:**
- No explicit linter/formatter configured
- TypeScript strict mode enabled (`"strict": true` in tsconfig.json)
- Indentation: 2 spaces
- Line length: No hard limit observed
- String quotes: Single quotes for code, double quotes in JSX attributes

**Linting:**
- TypeScript compiler enforces:
  - No unused locals (`"noUnusedLocals": true`)
  - No unused parameters (`"noUnusedParameters": true`)
  - No fallthrough switch cases (`"noFallthroughCasesInSwitch": true`)
- No ESLint or Prettier config file present

## Import Organization

**Order:**
1. React and third-party libraries (e.g., `import { useEffect, useState } from 'react'`)
2. Custom modules from lib/ (e.g., `import { supabase } from '../../lib/supabase'`)
3. Custom components (e.g., `import OrderForm from '../../components/OrderForm'`)
4. Type imports (e.g., `import type { Order } from '../../types'`)
5. CSS imports (last) (e.g., `import './OrderForm.css'`)

**Path Aliases:**
- No path aliases configured
- Uses relative imports throughout (e.g., `../../lib/`, `../../components/`)

**Type imports:**
- Uses `import type { TypeName }` syntax for type-only imports
- Example: `import type { Session } from '@supabase/supabase-js'`

## Error Handling

**Patterns:**
- Try/catch for async operations: `try { ... } catch (e) { /* handle */ }`
- Type narrowing: `e instanceof Error ? e.message : String(e)`
- Silent failures: Some try/catch blocks swallow errors with empty catch (e.g., AudioContext creation)
- Error state management: Store errors in component state (e.g., `setError('message')`)
- Validation errors: Return early with error message, set state, don't throw
- API error handling: Check response and throw descriptive errors with context (e.g., status code in message)

**Example from `lib/ifood.ts`:**
```typescript
try {
  return JSON.parse(text)
} catch {
  throw new Error(`Resposta inválida (${res.status}): ${text.slice(0, 300)}`)
}
```

**Example from components:**
```typescript
async function fetchOrders() {
  const { data, error } = await supabase.from('orders').select('*')
  if (error) {
    setError('Erro ao carregar pedidos: ' + error.message)
  } else {
    setOrders(data as Order[])
    setError(null)
  }
}
```

## Logging

**Framework:** `console` object (Web API) only — no dedicated logging library

**Patterns:**
- Minimal console usage observed
- No debug logging in production code
- Comments used instead of logs for documenting logic

## Comments

**When to Comment:**
- Section dividers: `// ── SectionName ────────────────────────────`
- Complex algorithm explanations (rare)
- Business logic that isn't obvious from code
- NOT for describing what code obviously does

**JSDoc/TSDoc:**
- Minimal usage
- Type annotations relied upon for documentation
- Example: Export-level `export type { PollStatus }` with inline comment explaining purpose

**Comment Style:**
- Line comments: `// ──` for section dividers
- Line comments: `// text` for inline notes
- Block comments: Not observed in codebase
- Dividers mark logical sections within components (Config, Types, Helpers, Lifecycle, Render, etc.)

**Example from `AlertSystem/index.tsx`:**
```typescript
// ── Config ────────────────────────────────────────────────────────────────────

const WARNING_MS  = 5 * 60_000
const URGENT_MS   = 9 * 60_000

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertLevel = 'warning' | 'urgent' | 'overdue'
```

## Function Design

**Size:** 
- Helper functions: 5-15 lines typical
- Component render functions: 20-50 lines typical
- No explicit size limits; readability drives structure

**Parameters:** 
- Prefer object destructuring for component props
- Example: `function AlertCard({ alert, onDismiss }: { alert: AlertItem; onDismiss: (uid: string) => void })`
- Function params destructured inline with type annotations

**Return Values:** 
- React components return JSX
- Async data functions return Promises with explicit types or untyped (inferred)
- Helper functions return specific values or null/error states
- No explicit void returns except in event handlers

## Module Design

**Exports:**
- Named exports: Used for types (e.g., `export type { PollStatus }`)
- Default exports: Used for React components (e.g., `export default function OrderForm(...)`)
- All page-level components are default exports
- Library functions are default exports (e.g., `export async function syncIfood(...)`)

**Barrel Files:**
- Not used in this codebase
- Each component lives in its directory with `index.tsx`
- No re-export patterns observed

**File Structure for Components:**
```
ComponentName/
├── index.tsx      (component + helpers + subcomponents)
└── ComponentName.css  (styles)
```

**Page Structure:**
```
pages/PageName/
├── index.tsx      (main page component)
├── SubComponent.tsx  (optional child components)
└── PageName.css   (styles)
```

## State Management

**Pattern:** React hooks (useState, useRef, useEffect)

**State updates:**
- `setX(value)` for simple updates
- `setX(prev => ({ ...prev, field: newVal }))` for partial object updates
- `useRef` for values that don't trigger re-renders (e.g., `storeIdRef`, `firedRef`)

**Data fetching:**
- Supabase client calls in async functions within useEffect
- State variables for loading/error/data: `const [loading, setLoading] = useState(true)`
- Real-time subscriptions via `supabase.channel(...).on(...).subscribe()`

**Example from `Orders/index.tsx`:**
```typescript
async function fetchOrders() {
  setRefreshing(true)
  const { data, error } = await supabase.from('orders').select('*')
  if (error) {
    setError('message: ' + error.message)
  } else {
    setOrders(data as Order[])
    setError(null)
  }
  setLoading(false)
  setRefreshing(false)
}
```

## Type Safety

**Strict Mode:** Enabled in `tsconfig.json`

**Casting:**
- Used sparingly
- `as Type` syntax for Supabase responses: `const data = result as Order[]`
- `as React.CSSProperties` for inline style objects with CSS variables

**Type Guards:**
- Direct typeof/instanceof checks (e.g., `e instanceof Error`)
- Optional chaining: `data?.user`, `order?.dispatched_at`
- Nullish coalescing: `status ?? 'default'`

## CSS Organization

**Pattern:** Component-scoped CSS files (one per component/page)

**Naming conventions:**
- Section comments: `/* ── SectionName ─────────────────────── */`
- Class names: lowercase with hyphens (e.g., `.alert-card`, `.order-form-overlay`)
- Modifier classes: `element.state` (e.g., `.alert-card.dismissing`, `.modal.open`)
- Multi-word modifiers: hyphens (e.g., `.card-status`, `.form-input`)

**Variables:**
- CSS custom properties for dynamic colors (e.g., `--alert-platform-color`, `--platform-color`)
- Inline styles in React: Used for dynamic values only

**Example from component:**
```typescript
<div
  className="alert-card"
  style={{ '--alert-platform-color': color } as React.CSSProperties}
>
```

## React Patterns

**Hooks:**
- `useState` for component state
- `useRef` for persistent values and DOM refs
- `useEffect` for side effects and lifecycle
- `useMemo` for derived/expensive computations (e.g., route calculations)
- No custom hooks observed

**Props:**
- Typed as inline object in function params
- Destructured immediately in function signature
- No HOCs or render props

**Key prop:**
- Used on list items: `key={order.id}`, `key={alert.uid}`

**Conditional Rendering:**
- Ternary operators for simple cases
- Early returns for loading/error states
- Logical AND for optional sections (e.g., `{condition && <Component />}`)

**Portal/Modal patterns:**
- Modals rendered inline in component, positioned with CSS
- Overlay pattern: div with `className="modal-overlay"`, click to close

---

*Convention analysis: 2026-04-09*
