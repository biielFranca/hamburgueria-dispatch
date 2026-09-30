// dispatch-engine — classifies new orders and builds route suggestions for
// one store (roadmap 1.2). Replaces classify-orders + run-route-engine and the
// client-side ClassifierService/RouteEngineService: the rules now run once,
// on the server, whatever number of app windows is open.
//
// Called by (always with { store_id }):
//  - DB trigger (pg_net) when an order is inserted as 'received' or is sent
//    back to 'awaiting_route' by the operator
//  - pg_cron every minute while a store has orders waiting (solo-wait timer,
//    scheduled orders coming due, missed triggers)
//  - the Dev page, with the user's JWT (store derived from it)
//
// Concurrency: orders are *claimed* (awaiting_route → in_suggestion only where
// still awaiting_route) before a suggestion is written, so overlapping runs
// can't put one order in two suggestions — no lock needed.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveStoreScope } from '../_shared/requireStore.ts'
import { classifyOrder, needsGeocoding } from '../_shared/domain/classify.ts'
import { type LatLng, planRoutes, type PlannableOrder } from '../_shared/domain/routing.ts'
import { fastestSequence, geocodeAddress } from '../_shared/geo.ts'

const SOLO_WAIT_MS         = Number(Deno.env.get('SOLO_WAIT_MIN') ?? '10') * 60_000
const MAX_GEOCODES_PER_RUN = 10      // Nominatim: 1 request/second, keep runs short
const NOMINATIM_SPACING_MS = 1_100

type Outcome =
  | 'suggestion_created' | 'no_store_coords' | 'no_eligible_orders'
  | 'all_timed_out' | 'no_coords_on_orders' | 'solo_waiting'

interface RouteOrder extends PlannableOrder {
  status:              string
  platform_order_code: string | null
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function logEvent(
  db: SupabaseClient, orderId: string, storeId: string, eventType: string,
  previous: Record<string, unknown>, next: Record<string, unknown>, metadata: Record<string, unknown> | null = null,
) {
  await db.from('order_events').insert({
    order_id: orderId, store_id: storeId, event_type: eventType,
    actor_type: 'system', previous, next, metadata,
  })
}

// ── Step 1: classify ──────────────────────────────────────────────────────────

async function classifyStep(db: SupabaseClient, storeId: string): Promise<number> {
  // New orders, plus scheduled ones that may have come due
  const { data: orders, error } = await db.from('orders')
    .select('id, status, delivery_type, logistics_type, latitude, longitude, address_street, address_number, address_neighborhood, address_city, address_zip, estimated_delivery_at, route_eligibility')
    .eq('store_id', storeId)
    .or('status.eq.received,and(status.eq.normalized,route_eligibility.eq.awaiting,route_block_reason.eq.scheduled)')
    .order('created_at', { ascending: true })
    .limit(50)
  if (error) throw new Error(`classify fetch: ${error.message}`)

  let classified = 0
  let geocodes = 0
  for (const order of orders ?? []) {
    let coords: { latitude: number; longitude: number } | null = null
    if (needsGeocoding(order) && geocodes < MAX_GEOCODES_PER_RUN) {
      if (geocodes > 0) await sleep(NOMINATIM_SPACING_MS)
      geocodes++
      const hit = await geocodeAddress(order)
      if (hit) coords = { latitude: hit[0], longitude: hit[1] }
    }

    const result = classifyOrder(coords ? { ...order, ...coords } : order)
    if (result.status === order.status && result.route_eligibility === order.route_eligibility && !coords) continue

    const { data: updated, error: ue } = await db.from('orders')
      .update({
        status:             result.status,
        route_eligibility:  result.route_eligibility,
        route_block_reason: result.route_block_reason,
        ...(coords ?? {}),
      })
      .eq('id', order.id)
      .eq('status', order.status)   // someone else moved it meanwhile → leave it
      .select('id')
    if (ue) { console.warn('[dispatch-engine] classify update failed:', order.id, ue.message); continue }
    if (!updated?.length) continue

    classified++
    await logEvent(db, order.id, storeId, 'classified',
      { status: order.status, route_eligibility: order.route_eligibility },
      { status: result.status, route_eligibility: result.route_eligibility, route_block_reason: result.route_block_reason },
      coords ? { geocoded: true, source: 'dispatch-engine' } : null)
  }
  return classified
}

// ── Step 2: route suggestions ─────────────────────────────────────────────────

async function createSuggestion(db: SupabaseClient, storeId: string, storeCoord: LatLng, group: RouteOrder[]): Promise<string | null> {
  const { sequence, durationSeconds } = await fastestSequence(storeCoord, group)
  const ids = sequence.map(o => o.id)

  // Claim: only orders still awaiting_route move to in_suggestion
  const { data: claimed, error: ce } = await db.from('orders')
    .update({ status: 'in_suggestion' })
    .in('id', ids).eq('status', 'awaiting_route')
    .select('id')
  if (ce) throw new Error(`claim: ${ce.message}`)
  const release = async (which: string[]) => {
    if (which.length) await db.from('orders').update({ status: 'awaiting_route' }).in('id', which).eq('status', 'in_suggestion')
  }
  if ((claimed?.length ?? 0) !== ids.length) {
    // Another run took part of this group — give back what we took and stop
    await release((claimed ?? []).map(c => c.id))
    return null
  }

  const etaMin = durationSeconds ? Math.round(durationSeconds / 60) : null
  const { data: suggestion, error: se } = await db.from('dispatch_suggestions')
    .insert({ store_id: storeId, status: 'pending_review', suggested_sequence: ids, predicted_eta: etaMin, suggestion_version: 1 })
    .select('id').single()
  if (se || !suggestion) {
    await release(ids)
    throw new Error(`suggestion insert: ${se?.message ?? 'no row'}`)
  }

  const { error: le } = await db.from('dispatch_suggestion_orders')
    .insert(ids.map((order_id, i) => ({ suggestion_id: suggestion.id, order_id, position: i + 1 })))
  if (le) console.warn('[dispatch-engine] suggestion links failed:', le.message)

  for (let i = 0; i < sequence.length; i++) {
    await logEvent(db, sequence[i].id, storeId, 'route_suggested',
      { status: 'awaiting_route' }, { status: 'in_suggestion' },
      { suggestion_id: suggestion.id, position: i + 1, group_size: sequence.length, predicted_eta: etaMin })
  }
  return suggestion.id
}

async function routeStep(db: SupabaseClient, storeId: string): Promise<{ outcome: Outcome; detail?: string; suggestions: number; timedOut: number }> {
  const { data: store } = await db.from('stores').select('latitude, longitude').eq('id', storeId).single()
  if (store?.latitude == null || store?.longitude == null) return { outcome: 'no_store_coords', suggestions: 0, timedOut: 0 }
  const storeCoord: LatLng = [store.latitude, store.longitude]

  const { data, error } = await db.from('orders')
    .select('id, status, platform_order_code, latitude, longitude, rejection_count, created_at')
    .eq('store_id', storeId).eq('route_eligibility', 'eligible').eq('status', 'awaiting_route')
    .order('rejection_count', { ascending: false }).order('created_at', { ascending: true })
    .limit(50)
  if (error) throw new Error(`route fetch: ${error.message}`)
  const eligible = (data ?? []) as RouteOrder[]
  if (!eligible.length) return { outcome: 'no_eligible_orders', suggestions: 0, timedOut: 0 }

  const plan = planRoutes(eligible, storeCoord, Date.now(), SOLO_WAIT_MS)

  for (const o of plan.timedOut) {
    const { data: moved } = await db.from('orders')
      .update({ status: 'dispatch_timeout', route_eligibility: 'blocked', route_block_reason: 'max_rejections' })
      .eq('id', o.id).eq('status', 'awaiting_route').select('id')
    if (!moved?.length) continue
    await logEvent(db, o.id, storeId, 'timeout',
      { status: o.status, rejection_count: o.rejection_count },
      { status: 'dispatch_timeout', route_block_reason: 'max_rejections' },
      { reason: 'max_rejections' })
    await db.from('dispatch_alerts').insert({
      store_id: storeId, order_id: o.id, alert_type: 'dispatch_timeout',
      message: `Pedido ${o.platform_order_code ?? o.id.slice(0, 8)} atingiu o limite de recusas sem agrupamento.`,
    })
  }

  const codes: string[] = []
  for (const group of plan.groups) {
    if (await createSuggestion(db, storeId, storeCoord, group)) {
      codes.push(group.map(o => o.platform_order_code ?? o.id.slice(0, 8)).join(' + '))
    }
  }

  if (codes.length) return { outcome: 'suggestion_created', detail: codes.join(' | '), suggestions: codes.length, timedOut: plan.timedOut.length }
  if (plan.waiting) {
    const leftMin = Math.max(0, Math.ceil((SOLO_WAIT_MS - (Date.now() - new Date(plan.waiting.created_at).getTime())) / 60_000))
    return { outcome: 'solo_waiting', detail: `~${leftMin} min restantes`, suggestions: 0, timedOut: plan.timedOut.length }
  }
  if (plan.timedOut.length === eligible.length) return { outcome: 'all_timed_out', suggestions: 0, timedOut: plan.timedOut.length }
  return { outcome: 'no_coords_on_orders', detail: `${eligible.length - plan.timedOut.length} pedido(s) sem lat/lng`, suggestions: 0, timedOut: plan.timedOut.length }
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
    })
  }

  let bodyStoreId: string | undefined
  try {
    const body = await req.json()
    const raw = body?.store_id ?? body?.storeId
    bodyStoreId = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
  } catch {
    // empty body is fine for user calls (store comes from the JWT)
  }

  // Service role (trigger/cron) may name the store; a user only acts on theirs
  const auth = await resolveStoreScope(req, bodyStoreId)
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  try {
    const classified = await classifyStep(db, auth.storeId)
    const route = await routeStep(db, auth.storeId)
    console.log('[dispatch-engine] store=%s classified=%d outcome=%s suggestions=%d', auth.storeId, classified, route.outcome, route.suggestions)
    return json({ ok: true, classified, ...route })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[dispatch-engine] store=%s failed: %s', auth.storeId, msg)
    return json({ ok: false, error: msg }, 500)
  }
})
