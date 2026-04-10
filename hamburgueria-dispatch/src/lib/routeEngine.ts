import { supabase } from './supabase'
import type { Order, Store } from '../types'

// ── Config ────────────────────────────────────────────────────────────────────

const OSRM_BASE = import.meta.env.VITE_ROUTES_API_URL ?? 'https://router.project-osrm.org'
const SINGLE_ORDER_WAIT_MS = 10 * 60_000   // 10 min before dispatching solo
const MAX_REJECTIONS       = 3             // after this, mark as dispatch_timeout

// ── OSRM route query ──────────────────────────────────────────────────────────

interface RouteResult {
  duration: number   // seconds
  distance: number   // meters
}

async function getRouteDuration(
  coords: [number, number][],  // [lat, lng] pairs
): Promise<RouteResult> {
  // OSRM expects lng,lat order
  const coordStr = coords.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=false&profile=bike`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`OSRM error ${res.status}`)
  const json = await res.json()
  if (!json.routes?.length) throw new Error('No route found')

  return {
    duration: json.routes[0].duration,
    distance: json.routes[0].distance,
  }
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

  if (error) throw error
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

  if (error) throw error

  // Link orders to suggestion
  const orderLinks = sequence.map((order, idx) => ({
    suggestion_id: suggestion.id,
    order_id:      order.id,
    position:      idx + 1,
  }))

  await supabase.from('dispatch_suggestion_orders').insert(orderLinks)

  // Mark orders as in_suggestion
  await supabase
    .from('orders')
    .update({ status: 'in_suggestion' })
    .in('id', sequence.map(o => o.id))
}

// ── Handle rejection timeout ──────────────────────────────────────────────────

async function handleTimeouts(orders: Order[], storeId: string) {
  for (const order of orders) {
    if ((order.rejection_count ?? 0) >= MAX_REJECTIONS) {
      await supabase
        .from('orders')
        .update({ status: 'dispatch_timeout', route_eligibility: 'blocked', route_block_reason: 'max_rejections' })
        .eq('id', order.id)

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

// ── Main engine ───────────────────────────────────────────────────────────────

export async function runRouteEngine(storeId: string): Promise<void> {
  // Get store coordinates
  const { data: storeData } = await supabase
    .from('stores').select('*').eq('id', storeId).single()
  const store = storeData as Store | null
  if (!store?.latitude || !store?.longitude) return

  const storeCoord: [number, number] = [store.latitude, store.longitude]

  const eligible = await fetchEligibleOrders(storeId)
  if (eligible.length === 0) return

  // Handle max-rejection timeouts first
  await handleTimeouts(eligible, storeId)
  const active = eligible.filter(o => (o.rejection_count ?? 0) < MAX_REJECTIONS)
  if (active.length === 0) return

  // Filter orders with valid coordinates
  const withCoords = active.filter(o => o.latitude != null && o.longitude != null)
  if (withCoords.length === 0) return

  // ── Pair selection ──────────────────────────────────────────────────────────

  if (withCoords.length >= 2) {
    const [a, b] = withCoords  // highest priority first (sorted by rejection_count desc, created_at asc)
    const coordA: [number, number] = [a.latitude!, a.longitude!]
    const coordB: [number, number] = [b.latitude!, b.longitude!]

    let bestSequence: Order[]
    let bestDuration: number

    try {
      // Sequence 1: store → A → B
      const seq1 = await getRouteDuration([storeCoord, coordA, coordB])
      // Sequence 2: store → B → A
      const seq2 = await getRouteDuration([storeCoord, coordB, coordA])

      if (seq1.duration <= seq2.duration) {
        bestSequence = [a, b]
        bestDuration = seq1.duration
      } else {
        bestSequence = [b, a]
        bestDuration = seq2.duration
      }
    } catch {
      // API unavailable — create suggestion without ETA
      bestSequence = [a, b]
      bestDuration = 0
    }

    await createSuggestion(storeId, bestSequence, bestDuration || null)
    return
  }

  // ── Single order: wait 10 min before solo dispatch ──────────────────────────

  const solo = withCoords[0]
  const waitedMs = Date.now() - new Date(solo.created_at).getTime()
  if (waitedMs >= SINGLE_ORDER_WAIT_MS) {
    let duration: number | null = null
    try {
      const coordA: [number, number] = [solo.latitude!, solo.longitude!]
      const result = await getRouteDuration([storeCoord, coordA])
      duration = result.duration
    } catch {
      duration = null
    }
    await createSuggestion(storeId, [solo], duration)
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
