import { supabase } from './supabase'
import { geocodeOrderAddress } from './geocoder'
import { runRouteEngine } from './routeEngine'
import { logOrderEvent } from './orderEvents'
import type { Order, RouteEligibility } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClassificationResult {
  route_eligibility: RouteEligibility
  route_block_reason: string | null
  status: string
}

// ── Core classifier ───────────────────────────────────────────────────────────

export function classifyOrder(order: Order): ClassificationResult {
  // Rule 1: pickup orders are never routed
  if (order.delivery_type === 'pickup') {
    return {
      route_eligibility: 'blocked',
      route_block_reason: 'pickup_order',
      status: 'normalized',
    }
  }

  // Rule 2: platform-managed logistics (e.g. Keeta) → external monitoring only
  if (order.logistics_type === 'platform') {
    return {
      route_eligibility: 'external_monitoring',
      route_block_reason: null,
      status: 'normalized',
    }
  }

  // Rule 3: missing coordinates → awaiting geocoding
  if (order.latitude == null || order.longitude == null) {
    return {
      route_eligibility: 'awaiting',
      route_block_reason: 'missing_coordinates',
      status: 'normalized',
    }
  }

  // Rule 4: missing street address
  if (!order.address_street || order.address_street.trim() === '') {
    return {
      route_eligibility: 'blocked',
      route_block_reason: 'invalid_address',
      status: 'normalized',
    }
  }

  // Rule 5: scheduled order — estimated delivery is more than 30 min in the future
  if (order.estimated_delivery_at) {
    const eta = new Date(order.estimated_delivery_at).getTime()
    const now = Date.now()
    if (eta - now > 30 * 60_000) {
      return {
        route_eligibility: 'awaiting',
        route_block_reason: 'scheduled',
        status: 'normalized',
      }
    }
  }

  // Default: eligible for routing
  return {
    route_eligibility: 'eligible',
    route_block_reason: null,
    status: 'awaiting_route',
  }
}

// ── Batch: classify all pending orders (startup + poll fallback) ──────────────
//
// Varre pedidos com status='normalized' e os classifica.
// Garante que nenhum pedido fique preso mesmo se o Realtime INSERT
// não disparar (ex: Realtime não habilitado na tabela no Supabase).

export async function classifyPendingOrders(storeId: string): Promise<void> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, store_id, delivery_type, logistics_type, status, latitude, longitude, address_street, address_number, address_neighborhood, address_city, address_zip, route_eligibility, rejection_count, estimated_delivery_at, created_at, updated_at')
    .eq('store_id', storeId)
    .eq('status', 'normalized')
    .limit(50)

  if (error || !data?.length) return

  console.debug(`[Classifier] ${data.length} pedido(s) normalized encontrado(s) — classificando...`)

  let triggerEngine = false

  for (const order of data as Order[]) {
    let geocodedCoords: { latitude: number; longitude: number } | null = null

    if ((order.latitude == null || order.longitude == null) && order.address_street?.trim()) {
      const geo = await geocodeOrderAddress(
        order.address_street,
        order.address_number,
        order.address_neighborhood,
        order.address_city,
        order.address_zip,
      )
      if (geo) geocodedCoords = { latitude: geo.latitude, longitude: geo.longitude }
    }

    const enrichedOrder = geocodedCoords
      ? { ...order, latitude: geocodedCoords.latitude, longitude: geocodedCoords.longitude }
      : order as Order

    const result = classifyOrder(enrichedOrder)

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        route_eligibility:  result.route_eligibility,
        route_block_reason: result.route_block_reason,
        status:             result.status,
        ...(geocodedCoords ?? {}),
      })
      .eq('id', order.id)

    if (!updateError) {
      logOrderEvent({
        orderId:   order.id,
        storeId:   order.store_id,
        eventType: 'classified',
        actorType: 'system',
        previous:  { status: order.status, route_eligibility: order.route_eligibility ?? null },
        next: {
          status:             result.status,
          route_eligibility:  result.route_eligibility,
          route_block_reason: result.route_block_reason,
        },
        metadata: geocodedCoords ? { geocoded: true } : null,
      })
    }

    if (result.status === 'awaiting_route') triggerEngine = true
  }

  // Um único disparo do engine após classificar o lote
  if (triggerEngine) {
    runRouteEngine(storeId).catch(e =>
      console.error('[Classifier] runRouteEngine error:', e),
    )
  }
}

// ── Supabase Realtime subscription ────────────────────────────────────────────

let classifierChannel: ReturnType<typeof supabase.channel> | null = null

export function startClassifier(storeId: string): () => void {
  if (classifierChannel) return () => {}

  classifierChannel = supabase
    .channel(`classifier-${storeId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
        // Sem filtro server-side: o filtro por store_id exige REPLICA IDENTITY FULL
        // no Supabase. Sem isso, eventos não chegam. Filtramos client-side abaixo.
      },
      async (payload) => {
        const order = payload.new as Order
        if (order.store_id !== storeId) return  // filtro client-side

        // Processa TODOS os pedidos normalized pendentes — não só este INSERT.
        //
        // Motivo: se vários pedidos chegam quase simultaneamente, cada INSERT
        // dispara este handler. Classificar apenas o pedido do evento e acionar
        // o engine imediatamente faz o engine rodar com conjunto incompleto,
        // gerando pares ruins (ex: dois pedidos distantes enquanto vários
        // próximos ainda estão em 'normalized').
        //
        // Ao delegar para classifyPendingOrders, todos os normalized são
        // geocodificados e classificados numa única passagem antes do engine
        // ser acionado. Chamadas concorrentes retornam cedo (0 normalized
        // restantes) sem duplicar trabalho.
        await classifyPendingOrders(storeId).catch(e =>
          console.error('[Classifier] classifyPendingOrders error:', e),
        )
      },
    )
    .subscribe()

  return () => {
    if (classifierChannel) {
      supabase.removeChannel(classifierChannel)
      classifierChannel = null
    }
  }
}
