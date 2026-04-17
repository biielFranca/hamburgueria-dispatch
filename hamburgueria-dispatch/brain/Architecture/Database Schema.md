# Database Schema

## Summary
Supabase PostgreSQL schema for Hamburgueria Dispatch. All tables use RLS (Row Level Security) policies.

## Source
- `.planning/codebase/INTEGRATIONS.md`
- `task-log.md` (migrations listed)
- `hamburgueria-dispatch/src/types/index.ts`

## Tables

### users
User accounts linked to Supabase Auth.
```sql
id          uuid PRIMARY KEY
auth_id     uuid (FK → Supabase Auth)
username    text UNIQUE
role        text  -- 'owner' | 'admin' | 'operator'
store_id    uuid (FK → stores)
permissions jsonb DEFAULT '{"operational":true,"orders":true,"drivers":true}'
-- password_hash column REMOVED (migration: remove_password_hash_column)
```
**RLS:** `users_read_own_store` — user can read own record or others in same store_id.
Uses `SECURITY DEFINER` function `get_my_store_id()` to avoid recursion.

### stores
Store metadata and location.
```sql
id          uuid PRIMARY KEY
name        text
address     text
phone       text
latitude    float
longitude   float
```

### orders
All incoming orders from all platforms.
```sql
id                    uuid PRIMARY KEY
platform              text  -- 'ifood' | '99food' | 'keeta' | 'cardapio_web' | 'manual'
platform_order_id     text  -- external ID from platform
store_id              uuid (FK → stores)
status                text  -- OrderStatus enum
route_eligibility     text  -- RouteEligibility enum
route_block_reason    text
logistics_type        text  -- 'own' | 'platform'
delivery_type         text  -- 'delivery' | 'pickup'
customer_name         text
address_street        text
address_number        text
address_neighborhood  text
address_city          text
latitude              float
longitude             float
estimated_delivery_at timestamptz
rejection_count       int DEFAULT 0
items                 jsonb
created_at            timestamptz DEFAULT now()
```

### drivers
Driver roster per store.
```sql
id          uuid PRIMARY KEY
store_id    uuid (FK → stores)
name        text
phone       text
active      boolean DEFAULT true
```

### dispatch_suggestions
Route optimization suggestions.
```sql
id                uuid PRIMARY KEY
store_id          uuid (FK → stores)
driver_id         uuid (FK → drivers) nullable
status            text  -- 'pending_review' | 'dispatched' | 'rejected'
suggested_sequence uuid[]  -- ordered list of order IDs
created_at        timestamptz DEFAULT now()
```

### dispatch_suggestion_orders
Junction table: which orders belong to which suggestion (with sequence position).
```sql
id              uuid PRIMARY KEY
suggestion_id   uuid (FK → dispatch_suggestions)
order_id        uuid (FK → orders)
position        int  -- 1 or 2
```

### store_integrations
Platform credentials per store.
```sql
id            uuid PRIMARY KEY
store_id      uuid (FK → stores)
platform      text  -- 'ifood' | '99food' | 'keeta' | 'cardapio_web'
active        boolean
client_id     text
client_secret text  -- plaintext (security concern — see Decision Log)
last_sync_at  timestamptz
last_error    text
```

### dispatch_alerts
Alert tracking table (created in migration: `create_dispatch_alerts_table`).
```sql
id         uuid PRIMARY KEY
store_id   uuid (FK → stores)
order_id   uuid (FK → orders)
level      text  -- '5min' | '1min' | 'critical'
fired_at   timestamptz DEFAULT now()
```

## Migrations Applied (v1)
1. `fix_users_rls_restrict_by_store` — removed `using (true)`, added `get_my_store_id()` + scoped policy
2. `remove_password_hash_column` — dropped `password_hash` column from users
3. `create_dispatch_alerts_table` — created `dispatch_alerts` table with RLS
4. `add_permissions_to_users` — added `permissions jsonb` column to users

## Enums (TypeScript — `src/types/index.ts`)

```typescript
Platform = 'ifood' | '99food' | 'keeta' | 'cardapio_web' | 'manual'
UserRole = 'owner' | 'admin' | 'operator'
OrderStatus = 'new' | 'awaiting_route' | 'in_suggestion' | 'dispatched' | 'cancelled'
RouteEligibility = 'eligible' | 'blocked' | 'awaiting' | 'external_monitoring'
```

## Related Notes
- [[System Architecture]]
- [[Auth System]]
- [[Project Overview]]
