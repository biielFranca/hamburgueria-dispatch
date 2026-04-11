import { supabase } from './supabase'
import type { Order, Store } from '../types'

// ── Config ────────────────────────────────────────────────────────────────────

const OSRM_BASE            = import.meta.env.VITE_ROUTES_API_URL ?? 'https://router.project-osrm.org'
const OSRM_PROFILE         = import.meta.env.VITE_OSRM_PROFILE   ?? 'driving'
// VITE_SOLO_WAIT_MIN overrides the solo-order wait (useful for dev/testing, default 10 min)
const SINGLE_ORDER_WAIT_MS = Number(import.meta.env.VITE_SOLO_WAIT_MIN ?? 10) * 60_000
const MAX_REJECTIONS       = 3             // after this, mark as dispatch_timeout

// Mutex: prevents concurrent engine runs from creating duplicate suggestions
let engineRunning = false

// ── Haversine distance ────────────────────────────────────────────────────────

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

// ── OSRM route query ──────────────────────────────────────────────────────────

interface RouteResult {
  duration: number   // seconds
  distance: number   // meters
}

async function getRouteDuration(
  coords: [number, number][],  // [lat, lng] pairs
): Promise<RouteResult> {
  // OSRM expects lng,lat order; profile goes in the URL path, not as a query param
  const coordStr = coords.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url = `${OSRM_BASE}/route/v1/${OSRM_PROFILE}/${coordStr}?overview=false`

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

// ── Proximity pair selection ──────────────────────────────────────────────────
//
// Sempre inclui o pedido de maior prioridade (anchor = maior rejection_count,
// mais antigo). Entre os demais, escolhe o companheiro que minimiza a rota
// estimada via Haversine: min(d(loja,A), d(loja,B)) + d(A,B).
// OSRM é chamado apenas uma vez para definir a melhor sequência do par.

function selectBestPair(
  orders: Order[],
  storeCoord: [number, number],
): [Order, Order] {
  const anchor = orders[0]  // highest priority (sorted by rejection DESC, created_at ASC)
  const anchorLat = anchor.latitude!
  const anchorLon = anchor.longitude!
  const dAnchorStore = haversineKm(storeCoord[0], storeCoord[1], anchorLat, anchorLon)

  let bestCompanion = orders[1]
  let bestScore = Infinity

  for (let i = 1; i < orders.length; i++) {
    const candidate = orders[i]
    const candLat = candidate.latitude!
    const candLon = candidate.longitude!

    const dCandStore = haversineKm(storeCoord[0], storeCoord[1], candLat, candLon)
    const dPair      = haversineKm(anchorLat, anchorLon, candLat, candLon)

    // Estimated best route for this pair = closer stop first + distance between stops
    const score = Math.min(dAnchorStore, dCandStore) + dPair

    if (score < bestScore) {
      bestScore = score
      bestCompanion = candidate
    }
  }

  return [anchor, bestCompanion]
}

// ── Main engine ───────────────────────────────────────────────────────────────

export async function runRouteEngine(storeId: string): Promise<void> {
  // Mutex: skip if already running to prevent duplicate suggestions
  if (engineRunning) {
    console.debug('[RouteEngine] Já em execução — chamada concorrente ignorada.')
    return
  }
  engineRunning = true

  try {
    // Get store coordinates
    const { data: storeData } = await supabase
      .from('stores').select('*').eq('id', storeId).single()
    const store = storeData as Store | null
    if (!store?.latitude || !store?.longitude) {
      console.warn('[RouteEngine] Loja sem coordenadas configuradas — engine pausado. Configure lat/lng em Configurações.')
      return
    }

    const storeCoord: [number, number] = [store.latitude, store.longitude]

    const eligible = await fetchEligibleOrders(storeId)
    if (eligible.length === 0) {
      console.debug('[RouteEngine] Nenhum pedido elegível no momento.')
      return
    }

    console.debug(`[RouteEngine] ${eligible.length} pedido(s) elegível(is) encontrado(s).`)

    // Handle max-rejection timeouts first
    await handleTimeouts(eligible, storeId)
    const active = eligible.filter(o => (o.rejection_count ?? 0) < MAX_REJECTIONS)
    if (active.length === 0) return

    // Filter orders with valid coordinates
    const withCoords = active.filter(o => o.latitude != null && o.longitude != null)
    if (withCoords.length === 0) {
      console.warn('[RouteEngine] Pedidos elegíveis sem coordenadas — impossível calcular rota.')
      return
    }

    // ── Pair selection (proximity-based) ──────────────────────────────────────

    if (withCoords.length >= 2) {
      const [anchor, companion] = selectBestPair(withCoords, storeCoord)
      const coordAnchor: [number, number] = [anchor.latitude!, anchor.longitude!]
      const coordComp:   [number, number] = [companion.latitude!, companion.longitude!]

      console.debug(
        `[RouteEngine] Par selecionado: ${anchor.platform_order_code ?? anchor.id.slice(0, 8)}` +
        ` + ${companion.platform_order_code ?? companion.id.slice(0, 8)}`
      )

      let bestSequence: Order[]
      let bestDuration: number

      try {
        // Sequence 1: store → anchor → companion
        const seq1 = await getRouteDuration([storeCoord, coordAnchor, coordComp])
        // Sequence 2: store → companion → anchor
        const seq2 = await getRouteDuration([storeCoord, coordComp, coordAnchor])

        if (seq1.duration <= seq2.duration) {
          bestSequence = [anchor, companion]
          bestDuration = seq1.duration
        } else {
          bestSequence = [companion, anchor]
          bestDuration = seq2.duration
        }
      } catch {
        // OSRM unavailable — use Haversine to pick sequence, no ETA
        const dAnchorFirst = haversineKm(storeCoord[0], storeCoord[1], coordAnchor[0], coordAnchor[1])
        const dCompFirst   = haversineKm(storeCoord[0], storeCoord[1], coordComp[0], coordComp[1])
        bestSequence = dAnchorFirst <= dCompFirst ? [anchor, companion] : [companion, anchor]
        bestDuration = 0
      }

      await createSuggestion(storeId, bestSequence, bestDuration || null)
      return
    }

    // ── Single order: wait before solo dispatch ───────────────────────────────

    const solo = withCoords[0]
    const waitedMs     = Date.now() - new Date(solo.created_at).getTime()
    const waitedMin    = Math.floor(waitedMs / 60_000)
    const remainingMin = Math.ceil((SINGLE_ORDER_WAIT_MS - waitedMs) / 60_000)

    if (waitedMs < SINGLE_ORDER_WAIT_MS) {
      console.debug(`[RouteEngine] 1 pedido solo aguardando — ${waitedMin}min passados, faltam ~${remainingMin}min.`)
      return
    }

    console.debug('[RouteEngine] Pedido solo atingiu tempo de espera — despachando.')
    let duration: number | null = null
    try {
      const result = await getRouteDuration([storeCoord, [solo.latitude!, solo.longitude!]])
      duration = result.duration
    } catch {
      duration = null
    }
    await createSuggestion(storeId, [solo], duration)

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
