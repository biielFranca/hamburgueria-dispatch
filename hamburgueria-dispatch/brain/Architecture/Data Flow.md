# Data Flow

## Summary
Detailed data flow for the four main operational flows in Hamburgueria Dispatch.

## Source
- `.planning/codebase/ARCHITECTURE.md`
- `hamburgueria-dispatch/src/App.tsx`
- `hamburgueria-dispatch/src/components/`

## 1. iFood Order Ingestion Flow

```
iFood Merchant API
  → Supabase Edge Function (ifood-sync)
    → Normalize payload to internal Order format
    → INSERT into orders table (platform='ifood')
      → Supabase Realtime fires INSERT event
        → ClassifierService.onInsert()
          → classifyOrder(order)
            → UPDATE orders SET route_eligibility, status
              → If eligible:
                → RouteEngineService triggers
                → runRouteEngine(storeId)
                  → SELECT eligible orders
                  → Call routing API (pairs 2 orders)
                  → INSERT dispatch_suggestion + dispatch_suggestion_orders
                    → Operational page Realtime fires
                      → fetchAll() re-fetches suggestions
```

## 2. User Login Flow

```
User types username + password
  → Login page: SELECT users WHERE username = ?
    → Extracts auth_id
    → supabase.auth.signInWithPassword({email: username@dispatch.internal, password})
      → Supabase Auth validates
        → App.tsx onAuthStateChange fires (SIGNED_IN)
          → fetchUserRole(): SELECT role, permissions FROM users WHERE auth_id = ?
            → App state: session, userRole, userPermissions set
              → Sidebar renders with role-filtered nav
              → Active page renders (Operational by default)
              → localStorage.setItem('dispatch_login_at', Date.now())
```

## 3. Alert Flow

```
AlertSystem (setInterval every 20s)
  → SELECT orders WHERE status NOT IN (dispatched, cancelled)
    → For each order:
      → Calculate age = (now - created_at) in minutes
      → If age >= 10 AND !firedRef.has(orderId-overdue) → playAlert('critical') + toast
      → If age >= 9 AND !firedRef.has(orderId-1min) → playAlert('1min') + toast
      → If age >= 5 AND !firedRef.has(orderId-5min) → playAlert('5min') + toast
      → firedRef.add(key) to prevent duplicates
```

## 4. Dispatch Suggestion Accept Flow

```
Operator on Operational page:
  → Selects driver from dropdown
  → Clicks "Aceitar" on suggestion block
    → UPDATE dispatch_suggestions SET status='dispatched', driver_id=?
      → UPDATE orders SET status='dispatched' WHERE id IN suggestion.order_ids
        → If platform=ifood: call iFood dispatch confirmation endpoint
        → Operational map: dispatched orders fade out (ghost animation 60s)
```

## State Management Pattern

All state is local React state. No global store. Key state locations:

| State | Location | Scope |
|-------|----------|-------|
| session, userRole, userPermissions | `App.tsx` | App-wide (passed as props) |
| activePage | `App.tsx` | Navigation |
| suggestions, orders, drivers | `Operational/index.tsx` | Page-level |
| driverSelections | `Operational/index.tsx` | Per-suggestion driver choice |
| alertCards | `AlertSystem/index.tsx` | Alert toasts |
| lastSync, lastError | `IfoodPoller/index.tsx` | Integration status indicator |
| store info | `Settings/index.tsx` | Form state |

## Related Notes
- [[System Architecture]]
- [[Classifier]]
- [[Route Engine]]
- [[Alert System]]
- [[iFood Integration]]
