# Testing Patterns

**Analysis Date:** 2026-04-09

## Test Framework

**Runner:**
- No test framework detected
- No `jest`, `vitest`, or similar in `package.json`
- No `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` files in source (`src/`)
- **Status:** Testing infrastructure not implemented

**Build/Development:**
- TypeScript compiler (`tsc`) validates types
- Vite dev server for development
- No test run commands in `package.json`

## Test File Organization

**Location:**
- Not applicable — no test files present

**Naming:**
- Not applicable

**Structure:**
- Not applicable

## Test Structure

**Current approach:**
- Manual testing via Tauri dev window (`npm run tauri dev`)
- No automated test suite

## Mocking

**Framework:**
- Not applicable — no test framework configured

**Current approach:**
- Supabase client calls are made directly in components
- Live database queries in development
- No mock providers or fake implementations

## Fixtures and Factories

**Test Data:**
- Not applicable

**Location:**
- Not applicable

## Coverage

**Requirements:** 
- None enforced
- **Status:** 0% — no automated tests

## Testing Patterns Needed

**Current gaps:**

**1. Unit Tests Missing For:**
- Helper functions in `lib/` (e.g., `ifood.ts` sync logic)
- Type definitions validation
- Error handling in API calls

**2. Integration Tests Missing For:**
- Supabase client initialization and configuration
- iFood API integration (`syncIfood`, `testIfoodCredentials`)
- Real-time subscription handlers (channel subscriptions in pages)
- Order state transitions

**3. Component Tests Missing For:**
- Form validation (e.g., `OrderForm` validation logic)
- Modal open/close transitions
- List rendering and filtering (`Orders`, `Operational`)
- Event handler callbacks

**4. E2E Tests:**
- Not present
- Recommended: Tauri integration tests for window lifecycle
- Recommended: Full order creation → dispatch flow

## Recommended Implementation Path

**Phase 1: Testing Infrastructure**
- Add Vitest (lighter than Jest, better with Vite)
- Add React Testing Library for component tests
- Create `vitest.config.ts` in project root
- Add test scripts to `package.json`

**Phase 2: Critical Path Tests**
- Test helper functions: `lib/ifood.ts`, format functions
- Test form validation in `OrderForm`
- Test Supabase client initialization

**Phase 3: Component Tests**
- Modal interactions (open/close)
- Order list filtering by platform
- Driver selection in suggestions

**Phase 4: Integration Tests**
- Supabase subscription handlers
- iFood sync polling
- Session expiry check in App

## Current Manual Testing Approach

**Dev Workflow (from memory):**
- Run: `npm run tauri dev`
- Opens Tauri WebView window
- Test in live environment against real Supabase
- No snapshot or regression protection

**Suggested Testing Additions:**

**For Components:**
```typescript
// Example test structure needed:
describe('OrderForm', () => {
  it('validates required customer name', () => {
    // Would test that form rejects empty customer name
  })

  it('calculates order total correctly', () => {
    // Would verify calcTotal helper with sample items
  })

  it('submits with normalized data', () => {
    // Would verify normalizeOrder creates correct payload
  })
})
```

**For Libraries:**
```typescript
// Example for lib/ifood.ts
describe('ifood', () => {
  it('throws on empty response', () => {
    // Would mock fetch returning empty response
  })

  it('parses valid JSON response', () => {
    // Would verify JSON parsing works
  })

  it('handles iFood API errors', () => {
    // Would test error messages from API
  })
})
```

**For Async/State:**
```typescript
// Example for component state management
describe('AlertSystem', () => {
  it('dismisses alert after timeout', async () => {
    // Would test DISMISS_MS behavior
    // Would verify remove from alerts array
  })

  it('prevents duplicate alerts for same order/level', () => {
    // Would test firedRef Set behavior
  })
})
```

## Validation Patterns Found in Code

**Form Validation (in `OrderForm`):**
```typescript
function validate(): string | null {
  if (!form.customer_name.trim())  return 'Nome do cliente é obrigatório.'
  if (!form.address_street.trim()) return 'Rua é obrigatória.'
  if (form.items.every(it => !it.name.trim())) return 'Adicione pelo menos um item.'
  return null
}
```

**Data Normalization (in `OrderForm`):**
```typescript
function normalizeOrder(form: FormState, storeId: string) {
  // Trims strings, calculates totals, determines initial status
  // Returns normalized database payload
}
```

**Type-Safe API Response Handling (in `lib/ifood.ts`):**
```typescript
const { ok, error, events } = data
if (!data.ok && data.error) throw new Error(data.error)
return data as IfoodSyncResult
```

## Testing Recommendations

**High Priority (for stability):**
1. Add Vitest framework
2. Test `lib/ifood.ts` API integration with mocked fetch
3. Test form validation in `OrderForm`
4. Test `formatCurrency`, `formatTime` helpers
5. Test order state transition logic in `Operational`

**Medium Priority (for confidence):**
6. Component snapshot tests for modals
7. Supabase client mock for data fetching tests
8. Alert state management in `AlertSystem`
9. Session expiry check in `App`

**Low Priority (for robustness):**
10. E2E tests via Tauri testing
11. Real-time subscription handlers
12. Driver assignment workflows

## ESLint Configuration Gap

**Note:** No `.eslintrc` or similar config file present. Consider adding:

```javascript
// Recommended: .eslintrc.json
{
  "extends": ["eslint:recommended", "plugin:react/recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "no-console": "warn",
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

---

*Testing analysis: 2026-04-09*
