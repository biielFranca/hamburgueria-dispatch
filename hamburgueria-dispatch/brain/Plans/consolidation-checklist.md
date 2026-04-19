# Consolidation Checklist — Core Operational Review

## Summary
End-to-end audit of what was built, what needs deployment steps, and what scenarios remain for real-operation testing.

---

## 1. Core operational flow — status

| Step | Before | After | Status |
|------|--------|-------|--------|
| Order ingestion | Edge fn (webhook) | Edge fn (webhook) | ✅ Already backend |
| iFood polling | Frontend | Frontend (temporary) | ⚠ Acceptable until webhook |
| Classification | Frontend poll 5s | Edge fn `classify-orders` | ✅ Migrated |
| Geocoding | Frontend, no abstraction | Edge fn + `NominatimGeocodingProvider` | ✅ Abstracted |
| Route engine | Frontend poll 15s | Edge fn `run-route-engine` | ✅ Migrated |
| Alert severity | Frontend computed | DB function + `orders.alert_level` | ✅ Migrated |
| Audit trail | Client-side writes | DB trigger `trg_order_status_audit` + backend | ✅ Hardened |
| Dispatch confirm | Edge fn | Edge fn | ✅ Already backend |

---

## 2. Platform / infrastructure — status

| Item | Status | Notes |
|------|--------|-------|
| RLS on all tables | ✅ | `20260419_rls_all_tables.sql` |
| Audit trigger | ✅ | `trg_order_status_audit` fires on every status change |
| Idempotency | ✅ | `idempotency_keys` table + `orders_platform_unique` constraint |
| One pending suggestion per store | ✅ | Partial unique index |
| Retry queue | ✅ | `retry_queue` + backoff functions |
| Observability | ✅ | `execution_logs` table + views |
| App.tsx diluted | ✅ | `AuthBootstrap` + `AccessControl` + `AppNavigation` + `AppShell` |
| Provider abstraction | ✅ | `GeocodingProvider` / `RoutingProvider` interfaces in `src/lib/providers.ts` |
| Backend flag per service | ✅ | `VITE_BACKEND_CLASSIFIER` / `VITE_BACKEND_ROUTE_ENGINE` |

---

## 3. Cardápio + Estoque — status

| Item | Status |
|------|--------|
| `catalog_items` + categories | ✅ Migration + UI |
| `catalog_item_aliases` | ✅ Migration + UI alias panel |
| `platform_item_mapping` | ✅ Migration + UI mappings tab |
| `item_availability_state` | ✅ Migration + availability badge |
| `inventory_items` | ✅ Migration + UI saldos tab |
| `stock_movements` ledger | ✅ Migration + UI movements tab |
| `item_components` (recipe) | ✅ Migration + UI receitas tab |
| `inventory_thresholds` | ✅ Migration |
| `availability_rules` | ✅ Migration |
| Stock deduction on dispatch | ✅ `trg_order_dispatch_deduct` trigger |
| Rupture → availability update | ✅ `recompute_item_availability` function |

---

## 4. Deployment steps required (not done in code)

1. **Apply all migrations** to Supabase project in order:
   ```
   20260419_alert_state.sql
   20260419_audit_hardening.sql
   20260419_rls_all_tables.sql
   20260419_idempotency.sql
   20260419_retry_queue.sql
   20260419_observability.sql
   20260419_catalog_domain.sql
   20260419_inventory_domain.sql
   20260419_stock_deduction.sql
   ```

2. **Deploy edge functions**:
   ```
   supabase functions deploy classify-orders
   supabase functions deploy run-route-engine
   supabase functions deploy compute-alert-state
   ```

3. **Configure DB webhooks** (Supabase dashboard → Database → Webhooks):
   - `orders` INSERT → invoke `classify-orders`
   - `orders` UPDATE WHERE status='awaiting_route' → invoke `run-route-engine`

4. **Schedule `compute-alert-state`** every 30s via pg_cron or Supabase scheduled functions.

5. **Set env flags** in production `.env`:
   ```
   VITE_BACKEND_CLASSIFIER=true
   VITE_BACKEND_ROUTE_ENGINE=true
   ```

6. **Verify `REPLICA IDENTITY FULL`** on `orders` table (required for Realtime filters).

---

## 5. Failure scenarios to test

| Scenario | Expected behaviour | Test method |
|----------|--------------------|-------------|
| 2 operators, same store | Engine lock prevents duplicate suggestions | Open 2 windows, add order |
| Frontend closed | classify-orders + run-route-engine still process | Disable frontend, insert order directly |
| Nominatim down | Order stays `awaiting` with reason=missing_coordinates | Mock 503 in dev |
| OSRM down | Engine falls back to haversine nearest-neighbor | Mock 503 |
| Webhook duplicated | Second insert fails on `orders_platform_unique` | Re-POST same webhook |
| Retry of dispatch confirm | `retry_queue` entry created; re-processed on next run | Kill confirm fn mid-flight |
| Order with zero-stock item | Dispatch deducted → rupture → item paused | Pre-zero inventory, dispatch order |
| `estimate_delivery_at` 1h future | Classified as `awaiting` (scheduled) | Insert order with future ETA |
| rejection_count ≥ 3 | `dispatch_timeout`, alert inserted | Reject suggestion 3 times |
| Operator rejects all suggestions | Same as above | Manual test |

---

## 6. Architecture freeze criteria

The core architecture is frozen and ready for expansion when:

- [ ] All 9 migrations applied and verified
- [ ] 3 edge functions deployed and tested
- [ ] DB webhooks configured
- [ ] `compute-alert-state` scheduled
- [ ] `VITE_BACKEND_*=true` flags set in production
- [ ] At least 5 scenarios from section 5 verified in staging
- [ ] `execution_logs` showing successful runs (no error rows)
- [ ] `order_events` showing backend actor_type=system for all domain transitions

Once all checkboxes are ✅, mobile, social media, and additional modules can begin without risk of structural collapse.
