/**
 * run-route-engine
 *
 * Invoked by:
 *   - classify-orders edge fn after promoting orders to awaiting_route
 *   - Realtime DB webhook on orders UPDATE (status=awaiting_route)
 *   - Direct POST { store_id } for manual requeue / testing
 *
 * Per-store advisory lock prevents concurrent runs from generating
 * duplicate suggestions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveStoreScope } from '../_shared/requireStore.ts'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OSRM_BASE       = Deno.env.get('ROUTES_API_URL') ?? 'https://router.project-osrm.org'
const OSRM_PROFILE    = Deno.env.get('OSRM_PROFILE')  ?? 'driving'
const SINGLE_ORDER_WAIT_MIN = Number(Deno.env.get('SOLO_WAIT_MIN') ?? '10')
const SINGLE_ORDER_WAIT_MS  = SINGLE_ORDER_WAIT_MIN * 60_000
const MAX_REJECTIONS        = 3
const ROUTE_TIMEOUT_MS      = 10_000

// ── Client ────────────────────────────────────────────────────────────────────

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false },
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Order {
  id: string
  store_id: string
  status: string
  latitude: number | null
  longitude: number | null
  platform_order_code: string | null
  created_at: string
  rejection_count: number
}

interface Store {
  id: string
  latitude: number | null
  longitude: number | null
}

// ── Routing helpers ───────────────────────────────────────────────────────────

async function getRouteDuration(coords: [number, number][]): Promise<number> {
  const coordStr = coords.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url = `${OSRM_BASE}/route/v1/${OSRM_PROFILE}/${coordStr}?overview=false`

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ROUTE_TIMEOUT_MS)

  try {
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const json = await res.json()
    if (!json.routes?.length) throw new Error('No route')
    return json.routes[0].duration as number
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

// ── Combinatorics ─────────────────────────────────────────────────────────────

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  return arr.flatMap((item, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [item, ...p]),
  )
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  return [...combinations(rest, k - 1).map(c => [first, ...c]), ...combinations(rest, k)]
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function nearestNeighborScore(storeCoord: [number, number], orders: Order[]): number {
  let pos = storeCoord
  const remaining = [...orders]
  let total = 0
  while (remaining.length > 0) {
    let bestDist = Infinity, bestIdx = 0
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(pos[0], pos[1], remaining[i].latitude!, remaining[i].longitude!)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    total += bestDist
    pos = [remaining[bestIdx].latitude!, remaining[bestIdx].longitude!]
    remaining.splice(bestIdx, 1)
  }
  return total
}

function nearestNeighborOrder(storeCoord: [number, number], orders: Order[]): Order[] {
  let pos = storeCoord
  const remaining = [...orders]
  const result: Order[] = []
  while (remaining.length > 0) {
    let bestDist = Infinity, bestIdx = 0
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(pos[0], pos[1], remaining[i].latitude!, remaining[i].longitude!)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    result.push(remaining[bestIdx])
    pos = [remaining[bestIdx].latitude!, remaining[bestIdx].longitude!]
    remaining.splice(bestIdx, 1)
  }
  return result
}

function selectBestGroup(orders: Order[], storeCoord: [number, number]): Order[] {
  const MAX_GROUP = 3
  let bestScore = Infinity
  let bestGroup: Order[] = []

  for (let size = Math.min(MAX_GROUP, orders.length); size >= 2; size--) {
    for (const group of combinations(orders, size)) {
      const score = nearestNeighborScore(storeCoord, group) / group.length
      if (score < bestScore) { bestScore = score; bestGroup = group }
    }
  }
  return bestGroup
}

async function findOptimalSequence(
  storeCoord: [number, number],
  orders: Order[],
): Promise<{ sequence: Order[]; durationSeconds: number | null }> {
  if (orders.length === 0) return { sequence: [], durationSeconds: null }

  if (orders.length === 1) {
    let dur: number | null = null
    try { dur = await getRouteDuration([storeCoord, [orders[0].latitude!, orders[0].longitude!]]) } catch {}
    return { sequence: orders, durationSeconds: dur }
  }

  const perms = permutations(orders)
  const settled = await Promise.allSettled(
    perms.map(p =>
      getRouteDuration([storeCoord, ...p.map(o => [o.latitude!, o.longitude!] as [number, number])]),
    ),
  )

  let minDur = Infinity
  let bestSeq: Order[] | null = null
  let bestDur: number | null = null

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]
    if (r.status === 'fulfilled' && r.value < minDur) {
      minDur = r.value; bestSeq = perms[i]; bestDur = r.value
    }
  }

  if (!bestSeq) {
    bestSeq = nearestNeighborOrder(storeCoord, orders)
    bestDur = null
  }

  return { sequence: bestSeq, durationSeconds: bestDur }
}

// ── Audit ─────────────────────────────────────────────────────────────────────

async function logEvent(
  db: ReturnType<typeof adminClient>,
  orderId: string,
  storeId: string,
  eventType: string,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  metadata?: Record<string, unknown>,
) {
  await db.from('order_events').insert({
    order_id: orderId, store_id: storeId, event_type: eventType,
    actor_type: 'system', previous, next, metadata: metadata ?? null,
  })
}

// ── Main engine ───────────────────────────────────────────────────────────────

async function runEngine(storeId: string): Promise<{ outcome: string; detail?: string }> {
  const db = adminClient()

  // Advisory lock per store — prevents concurrent runs from creating duplicate suggestions
  // Uses store_id hash (bigint) via pg_advisory_xact_lock called through RPC
  const lockKey = BigInt('0x' + btoa(storeId).replace(/[^a-f0-9]/gi, '').slice(0, 12) || '1')
  await db.rpc('pg_advisory_lock', { key: Number(lockKey % BigInt(2147483647)) }).catch(() => {})

  try {
    // Check for existing pending suggestion — prevents duplicates
    const { data: existingSuggestion } = await db
      .from('dispatch_suggestions')
      .select('id')
      .eq('store_id', storeId)
      .eq('status', 'pending_review')
      .maybeSingle()

    if (existingSuggestion) {
      return { outcome: 'pending_suggestion_exists', detail: existingSuggestion.id }
    }

    // Get store coordinates
    const { data: storeData } = await db.from('stores').select('*').eq('id', storeId).single()
    const store = storeData as Store | null
    if (!store?.latitude || !store?.longitude) return { outcome: 'no_store_coords' }

    const storeCoord: [number, number] = [store.latitude, store.longitude]

    // Fetch eligible orders
    const { data: eligible, error: fetchErr } = await db
      .from('orders')
      .select('*')
      .eq('store_id', storeId)
      .eq('route_eligibility', 'eligible')
      .eq('status', 'awaiting_route')
      .order('rejection_count', { ascending: false })
      .order('created_at', { ascending: true })

    if (fetchErr) throw fetchErr
    if (!eligible?.length) return { outcome: 'no_eligible_orders' }

    // Handle max-rejection timeouts
    for (const order of eligible as Order[]) {
      if ((order.rejection_count ?? 0) >= MAX_REJECTIONS) {
        await db.from('orders').update({
          status: 'dispatch_timeout',
          route_eligibility: 'blocked',
          route_block_reason: 'max_rejections',
        }).eq('id', order.id)

        await logEvent(db, order.id, storeId, 'timeout',
          { status: order.status, rejection_count: order.rejection_count },
          { status: 'dispatch_timeout', route_block_reason: 'max_rejections' },
          { reason: 'max_rejections', limit: MAX_REJECTIONS })

        await db.from('dispatch_alerts').insert({
          store_id: storeId, order_id: order.id,
          alert_type: 'dispatch_timeout',
          message: `Order ${order.platform_order_code ?? order.id.slice(0, 8)} reached ${MAX_REJECTIONS} rejections.`,
        }).maybeSingle()
      }
    }

    const active = (eligible as Order[]).filter(o => (o.rejection_count ?? 0) < MAX_REJECTIONS)
    if (!active.length) return { outcome: 'all_timed_out' }

    const withCoords = active.filter(o => o.latitude != null && o.longitude != null)
    if (!withCoords.length) return { outcome: 'no_coords_on_orders', detail: `${active.length} sem lat/lng` }

    // Group selection
    let group: Order[]
    if (withCoords.length >= 2) {
      group = selectBestGroup(withCoords, storeCoord)
    } else {
      // Single order: enforce wait
      const solo = withCoords[0]
      const waitedMs = Date.now() - new Date(solo.created_at).getTime()
      if (waitedMs < SINGLE_ORDER_WAIT_MS) {
        const remainMin = Math.ceil((SINGLE_ORDER_WAIT_MS - waitedMs) / 60_000)
        return { outcome: 'solo_waiting', detail: `~${remainMin}min restantes` }
      }
      group = [solo]
    }

    const { sequence, durationSeconds } = await findOptimalSequence(storeCoord, group)

    // Create suggestion
    const { data: suggestion, error: sugErr } = await db
      .from('dispatch_suggestions')
      .insert({
        store_id:           storeId,
        status:             'pending_review',
        suggested_sequence: sequence.map(o => o.id),
        predicted_eta:      durationSeconds ? Math.round(durationSeconds / 60) : null,
        suggestion_version: 1,
      })
      .select()
      .single()

    if (sugErr) throw sugErr

    // Link orders to suggestion
    await db.from('dispatch_suggestion_orders').insert(
      sequence.map((o, idx) => ({ suggestion_id: suggestion.id, order_id: o.id, position: idx + 1 })),
    )

    // Mark orders in_suggestion
    await db.from('orders').update({ status: 'in_suggestion' }).in('id', sequence.map(o => o.id))

    // Audit
    for (let i = 0; i < sequence.length; i++) {
      const o = sequence[i]
      await logEvent(db, o.id, storeId, 'route_suggested',
        { status: o.status },
        { status: 'in_suggestion' },
        { suggestion_id: suggestion.id, position: i + 1, group_size: sequence.length, predicted_eta: durationSeconds ? Math.round(durationSeconds / 60) : null })
    }

    const codes = sequence.map(o => o.platform_order_code ?? o.id.slice(0, 8)).join(' + ')
    return { outcome: 'suggestion_created', detail: codes }

  } finally {
    await db.rpc('pg_advisory_unlock', { key: Number(lockKey % BigInt(2147483647)) }).catch(() => {})
  }
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' },
    })
  }

  let bodyStoreId: string | undefined
  try {
    const body = await req.json()
    bodyStoreId = body?.record?.store_id ?? body?.store_id ?? undefined
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 })
  }

  // Security: storeId is JWT-derived for user calls; service-role
  // (DB webhook, classify-orders -> run-route-engine chain) trusts body.
  const auth = await resolveStoreScope(req, bodyStoreId)
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), { status: auth.status })
  }
  const storeId = auth.storeId

  try {
    const result = await runEngine(storeId)
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[run-route-engine] error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 })
  }
})
