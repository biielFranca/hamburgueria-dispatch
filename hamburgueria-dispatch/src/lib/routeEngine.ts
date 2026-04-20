import { supabase } from './supabase'
import { logOrderEvent } from './orderEvents'
import { routingProvider } from './providers'
import type { Order, Store } from '../types'

// ── Config ────────────────────────────────────────────────────────────────────

const SINGLE_ORDER_WAIT_MS = Number(import.meta.env.VITE_SOLO_WAIT_MIN ?? 10) * 60_000
const MAX_REJECTIONS       = 3             // after this, mark as dispatch_timeout

// Mutex: prevents concurrent engine runs from creating duplicate suggestions
let engineRunning = false

// ── Haversine distance (pure, kept in frontend for map scoring) ───────────────

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// ── OSRM route query ──────────────────────────────────────────────────────────

/**
 * Fetch real road geometry for display on the map.
 * Returns [lat, lng] pairs (Leaflet format).
 * Throws on error — caller should fall back to straight lines.
 */
export async function fetchRouteGeometry(
  coords: [number, number][],
): Promise<[number, number][]> {
  const result = await routingProvider.getRouteGeometry(coords)
  return result.coords
}

// ── Fetch eligible orders ─────────────────────────────────────────────────────

async function fetchEligibleOrders(storeId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('store_id', storeId)
    .eq('route_eligibility', 'eligible')
    .eq('status', 'awaiting_route')
    .order('rejection_count', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message ?? JSON.stringify(error))
  return (data ?? []) as Order[]
}

// ── Create suggestion ─────────────────────────────────────────────────────────

async function createSuggestion(
  storeId: string,
  sequence: Order[],
  predictedEta: number | null,
) {
  const { data: suggestion, error } = await supabase
    .from('dispatch_suggestions')
    .insert({
      store_id:          storeId,
      status:            'pending_review',
      suggested_sequence: sequence.map(o => o.id),
      predicted_eta:     predictedEta ? Math.round(predictedEta / 60) : null,
      suggestion_version: 1,
    })
    .select()
    .single()

  if (error) throw new Error(error.message ?? JSON.stringify(error))

  // Link orders to suggestion (best-effort; main flow already succeeded above)
  const orderLinks = sequence.map((order, idx) => ({
    suggestion_id: suggestion.id,
    order_id:      order.id,
    position:      idx + 1,
  }))

  const { error: linkError } = await supabase.from('dispatch_suggestion_orders').insert(orderLinks)
  if (linkError) console.warn('[RouteEngine] dispatch_suggestion_orders insert failed:', linkError.message)

  // Mark orders as in_suggestion
  await supabase
    .from('orders')
    .update({ status: 'in_suggestion' })
    .in('id', sequence.map(o => o.id))

  // Audit: one event per order in the suggestion
  for (let i = 0; i < sequence.length; i++) {
    const o = sequence[i]
    logOrderEvent({
      orderId:   o.id,
      storeId,
      eventType: 'route_suggested',
      actorType: 'system',
      previous:  { status: o.status },
      next:      { status: 'in_suggestion' },
      metadata: {
        suggestion_id: suggestion.id,
        position:      i + 1,
        group_size:    sequence.length,
        predicted_eta: predictedEta ? Math.round(predictedEta / 60) : null,
      },
    })
  }
}

// ── Handle rejection timeout ──────────────────────────────────────────────────

async function handleTimeouts(orders: Order[], storeId: string) {
  for (const order of orders) {
    if ((order.rejection_count ?? 0) >= MAX_REJECTIONS) {
      await supabase
        .from('orders')
        .update({ status: 'dispatch_timeout', route_eligibility: 'blocked', route_block_reason: 'max_rejections' })
        .eq('id', order.id)

      logOrderEvent({
        orderId:   order.id,
        storeId,
        eventType: 'timeout',
        actorType: 'system',
        previous:  { status: order.status, rejection_count: order.rejection_count ?? 0 },
        next:      { status: 'dispatch_timeout', route_block_reason: 'max_rejections' },
        metadata:  { reason: 'max_rejections', limit: MAX_REJECTIONS },
      })

      // Insert a timeout alert in a dedicated alerts table if it exists — best effort
      try {
        await supabase.from('dispatch_alerts').insert({
          store_id: storeId,
          order_id: order.id,
          alert_type: 'dispatch_timeout',
          message: `Pedido ${order.platform_order_code ?? order.id.slice(0, 8)} atingiu ${MAX_REJECTIONS} recusas sem agrupamento.`,
        }).maybeSingle()
      } catch {
        // best effort
      }
    }
  }
}

// ── Proximity pair selection ──────────────────────────────────────────────────
//
// Avalia todas as combinações de 2 ou 3 pedidos e escolhe o grupo com o menor
// custo por entrega (distância haversine nearest-neighbor / num paradas).
// Isso garante que grupos compactos de 3 pedidos próximos sejam preferidos
// a pares dispersos, sem nunca forçar agrupamentos ruins.

// ── Helpers ───────────────────────────────────────────────────────────────────

export function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  return arr.flatMap((item, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [item, ...p]),
  )
}

export function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k),
  ]
}

/** Greedy nearest-neighbor total distance (for scoring groups). */
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

/** Greedy nearest-neighbor ordering (fallback when OSRM unavailable). */
export function nearestNeighborOrder(storeCoord: [number, number], orders: Order[]): Order[] {
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

const MAX_GROUP = 3  // max deliveries per suggestion

/**
 * Among all 2- and 3-order subsets, return the most efficient group.
 * Scored by haversine nearest-neighbor distance / num orders (lower = better).
 */
export function selectBestGroup(
  orders: Order[],
  storeCoord: [number, number],
): Order[] {
  let bestScore = Infinity
  let bestGroup: Order[] = []

  for (let size = Math.min(MAX_GROUP, orders.length); size >= 2; size--) {
    for (const group of combinations(orders, size)) {
      const score = nearestNeighborScore(storeCoord, group) / group.length
      if (score < bestScore) {
        bestScore = score
        bestGroup = group
      }
    }
  }

  return bestGroup
}

/**
 * Given store coords and a list of orders, find the optimal delivery sequence
 * by trying all permutations via OSRM (parallel). Falls back to nearest-neighbour
 * if OSRM fails. Safe for up to ~6 orders (6! = 720 calls — keep groups ≤ MAX_GROUP).
 */
export async function findOptimalSequence(
  storeCoord: [number, number],
  orders: Order[],
): Promise<{ sequence: Order[]; durationSeconds: number | null }> {
  if (orders.length === 0) return { sequence: [], durationSeconds: null }

  if (orders.length === 1) {
    let dur: number | null = null
    try {
      const r = await routingProvider.getRouteDuration([storeCoord, [orders[0].latitude!, orders[0].longitude!]])
      dur = r.duration
    } catch {}
    return { sequence: orders, durationSeconds: dur }
  }

  const perms = permutations(orders)

  const settled = await Promise.allSettled(
    perms.map(p =>
      routingProvider.getRouteDuration([
        storeCoord,
        ...p.map(o => [o.latitude!, o.longitude!] as [number, number]),
      ]),
    ),
  )

  let minDuration = Infinity
  let bestSequence: Order[] | null = null
  let bestDuration: number | null = null

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]
    if (r.status === 'fulfilled' && r.value.duration < minDuration) {
      minDuration = r.value.duration
      bestSequence = perms[i]
      bestDuration = r.value.duration
    }
  }

  if (!bestSequence) {
    // All OSRM calls failed — use haversine nearest-neighbor
    bestSequence = nearestNeighborOrder(storeCoord, orders)
    bestDuration = null
  }

  return { sequence: bestSequence, durationSeconds: bestDuration }
}

// ── Result type ───────────────────────────────────────────────────────────────

export type RouteEngineOutcome =
  | 'suggestion_created'
  | 'concurrent_skip'
  | 'no_store_coords'
  | 'no_eligible_orders'
  | 'all_timed_out'
  | 'no_coords_on_orders'
  | 'solo_waiting'

export interface RouteEngineResult {
  outcome: RouteEngineOutcome
  detail?: string
}

// ── Main engine ───────────────────────────────────────────────────────────────

export async function runRouteEngine(storeId: string): Promise<RouteEngineResult> {
  // Mutex: skip if already running to prevent duplicate suggestions
  if (engineRunning) {
    return { outcome: 'concurrent_skip' }
  }
  engineRunning = true

  try {
    // Get store coordinates
    const { data: storeData } = await supabase
      .from('stores').select('*').eq('id', storeId).single()
    const store = storeData as Store | null
    if (!store?.latitude || !store?.longitude) {
      return { outcome: 'no_store_coords' }
    }

    const storeCoord: [number, number] = [store.latitude, store.longitude]

    const eligible = await fetchEligibleOrders(storeId)
    if (eligible.length === 0) {
      return { outcome: 'no_eligible_orders' }
    }

    // Handle max-rejection timeouts first
    await handleTimeouts(eligible, storeId)
    const active = eligible.filter(o => (o.rejection_count ?? 0) < MAX_REJECTIONS)
    if (active.length === 0) {
      return { outcome: 'all_timed_out' }
    }

    // Filter orders with valid coordinates
    const withCoords = active.filter(o => o.latitude != null && o.longitude != null)
    if (withCoords.length === 0) {
      return { outcome: 'no_coords_on_orders', detail: `${active.length} pedido(s) sem lat/lng` }
    }

    // ── Group selection (up to MAX_GROUP orders, proximity-scored) ───────────

    if (withCoords.length >= 2) {
      const group = selectBestGroup(withCoords, storeCoord)
      const { sequence: bestSequence, durationSeconds } = await findOptimalSequence(storeCoord, group)
      await createSuggestion(storeId, bestSequence, durationSeconds || null)
      const codes = bestSequence.map(o => o.platform_order_code ?? o.id.slice(0, 8)).join(' + ')
      return { outcome: 'suggestion_created', detail: codes }
    }

    // ── Single order: wait before solo dispatch ───────────────────────────────

    const solo = withCoords[0]
    const waitedMs     = Date.now() - new Date(solo.created_at).getTime()
    const waitedMin    = Math.floor(waitedMs / 60_000)
    const remainingMin = Math.ceil((SINGLE_ORDER_WAIT_MS - waitedMs) / 60_000)

    if (waitedMs < SINGLE_ORDER_WAIT_MS) {
      return {
        outcome: 'solo_waiting',
        detail: `${waitedMin}min passados, faltam ~${remainingMin}min`,
      }
    }

    let duration: number | null = null
    try {
      const r = await routingProvider.getRouteDuration([storeCoord, [solo.latitude!, solo.longitude!]])
      duration = r.duration
    } catch {
      duration = null
    }
    await createSuggestion(storeId, [solo], duration)
    return {
      outcome: 'suggestion_created',
      detail: `${solo.platform_order_code ?? solo.id.slice(0, 8)} (solo)`,
    }

  } finally {
    engineRunning = false
  }
}

// ── Supabase Realtime subscription ────────────────────────────────────────────

let engineChannel: ReturnType<typeof supabase.channel> | null = null

export function startRouteEngine(storeId: string): () => void {
  if (engineChannel) return () => {}

  engineChannel = supabase
    .channel(`route-engine-${storeId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `store_id=eq.${storeId}`,
      },
      async (payload) => {
        const updated = payload.new as Order
        if (updated.status === 'awaiting_route') {
          await runRouteEngine(storeId)
        }
      },
    )
    .subscribe()

  return () => {
    if (engineChannel) {
      supabase.removeChannel(engineChannel)
      engineChannel = null
    }
  }
}
