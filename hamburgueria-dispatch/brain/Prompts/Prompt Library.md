# Prompt Library

## Summary
Reusable prompts and AI workflow instructions for Hamburgueria Dispatch development.

## Categories
- Security hardening
- Feature development
- Test generation
- Code review
- Database migrations

## Prompt Index

### Security: Remove Service Key from Frontend
```
The file hamburgueria-dispatch/src/lib/supabase.ts contains a `supabaseAdmin` 
client initialized with VITE_SUPABASE_SERVICE_KEY. 

Create a Supabase Edge Function that handles these admin operations:
1. Create user (POST /admin/users)
2. Update user password (PATCH /admin/users/:id)
3. Delete user (DELETE /admin/users/:id)

The Edge Function should:
- Authenticate via the standard Supabase JWT (operator must be owner/admin)
- Use the service key server-side only
- Return appropriate error messages

Then update src/pages/Users/index.tsx to call this Edge Function instead of supabaseAdmin.
```

### Generate Classifier Tests
```
The file hamburgueria-dispatch/src/lib/classifier.ts exports classifyOrder(order: Order): ClassificationResult.

It has 5 rules + a default case. Generate a complete Vitest test suite covering:
1. Rule 1: pickup → blocked/pickup_order
2. Rule 2: logistics_type=platform → external_monitoring
3. Rule 3: null lat/lng → awaiting/missing_coordinates
4. Rule 4: empty address_street → blocked/invalid_address
5. Rule 5: ETA > 30min future → awaiting/scheduled
6. Default: none of above → eligible + status=awaiting_route
7. Edge: all fields empty/null
8. Edge: ETA exactly 30min from now (boundary)

Read the Order type from src/types/index.ts first.
```

### Create useStoreId Hook
```
In hamburgueria-dispatch/src/, multiple components independently fetch store_id 
from the users table on every mount:
- src/pages/Orders/index.tsx
- src/pages/Operational/index.tsx
- src/components/IfoodPoller/index.tsx
- src/components/AlertSystem/index.tsx
- src/pages/Drivers/index.tsx
- src/pages/Integrations/index.tsx (removed but pattern exists)
- src/pages/Users/index.tsx

Create src/lib/hooks/useStoreId.ts that:
1. Fetches store_id once from supabase.auth.getUser() → users table
2. Caches the result (React Context or module-level cache)
3. Returns { storeId: string | null, loading: boolean, error: string | null }
4. Works safely with multiple concurrent callers (deduplicates the DB query)

Then replace one of the existing store_id fetch patterns as a proof of concept.
```

### Fix iFood Poller Toggle Bug
```
The file hamburgueria-dispatch/src/components/IfoodPoller/index.tsx reads the 
iFood integration active status once on mount (from store_integrations table).

When the user toggles active/inactive in Settings → Connections tab, the poller 
doesn't react until page reload.

Fix this by:
1. Adding a Supabase Realtime subscription to the store_integrations table
2. When the record for the current storeId changes, update the activeRef
3. If active becomes false: stop polling (clearInterval)
4. If active becomes true: start polling (setInterval)
5. Clean up subscription on component unmount

Read the current implementation fully before making changes.
```

## Usage Rules
- Always read the relevant source files before running a prompt
- Specify file paths explicitly in the prompt
- Prefer prompts that are idempotent (safe to re-run)
- Store only prompts worth reusing across sessions

## Related Notes
- [[Pending Work Register]]
- [[Main Knowledge Map]]
