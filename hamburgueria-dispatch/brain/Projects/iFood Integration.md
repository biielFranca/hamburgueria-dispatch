# iFood Integration

## Summary
Order sync from iFood Merchant API via Supabase Edge Function. Polls every 30 seconds. Credentials stored per store in `store_integrations` table.

## Source
- `hamburgueria-dispatch/src/lib/integrations/ifood.ts`
- `hamburgueria-dispatch/src/components/IfoodPoller/index.tsx`
- `hamburgueria-dispatch/src/pages/Settings/` (TabConnections)
- `.planning/codebase/INTEGRATIONS.md`

## How It Works

### IfoodPoller Component
Background component. No visible UI except status dot (bottom-left).
- On mount: resolves `store_id` from auth user → checks `store_integrations` for active iFood integration
- If active: calls `syncIfood(storeId)` every 30 seconds
- Shows: green dot (last sync OK), yellow dot (never synced), red dot (error)

### ifood.ts — Key Functions
```typescript
syncIfood(storeId: string): Promise<IfoodSyncResult>
  // Calls Supabase Edge Function 'ifood-sync' via Tauri HTTP (with fetch fallback)
  // Returns: { inserted, events, errors }

testIfoodCredentials(clientId: string, clientSecret: string): Promise<boolean>
  // Validates credentials against iFood API without saving
```

### Supabase Edge Function (ifood-sync)
- Hosted on Supabase
- Fetches iFood events from Merchant API using stored credentials
- Normalizes orders to internal format
- Inserts into `orders` table with `platform = 'ifood'`
- Acknowledges processed events (removes from iFood queue)

### OAuth Token Management
- OAuth 2.0 client_credentials flow
- Token cached in memory, renewed 5 minutes before expiry
- `client_id` + `client_secret` stored in `store_integrations` table

## Configuration
In Settings page → Connections tab:
1. Enter iFood Client ID + Client Secret
2. Save → credentials stored in `store_integrations`
3. Toggle active → IfoodPoller starts/stops automatically on next page reload

**Bug**: Toggling active/inactive requires page reload to take effect. IfoodPoller doesn't subscribe to real-time `store_integrations` changes.

## Error Handling
- HTTP 5xx or timeout: retry up to 3 times with exponential backoff
- Error stored in `store_integrations.last_error`
- Status dot shows red + error message

## Related Notes
- [[Open Delivery Integration]]
- [[Database Schema]]
- [[System Architecture]]
- [[Pending Work Register]]
