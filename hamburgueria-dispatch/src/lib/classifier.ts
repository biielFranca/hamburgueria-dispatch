import { supabase } from './supabase'
import { geocodeOrderAddress } from './geocoder'
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
        filter: `store_id=eq.${storeId}`,
      },
      async (payload) => {
        const order = payload.new as Order

        // Se o pedido não tem coordenadas mas tem rua, tenta geocodificar
        // usando CEP + número da casa antes de classificar
        let geocodedCoords: { latitude: number; longitude: number } | null = null

        if (
          (order.latitude == null || order.longitude == null) &&
          order.address_street?.trim()
        ) {
          console.debug(`[Classifier] Pedido ${order.platform_order_code ?? order.id.slice(0, 8)} sem coords — tentando geocodificar...`)

          const geo = await geocodeOrderAddress(
            order.address_street,
            order.address_number,
            order.address_neighborhood,
            order.address_city,
            order.address_zip,
          )

          if (geo) {
            geocodedCoords = { latitude: geo.latitude, longitude: geo.longitude }
            console.debug(`[Classifier] Geocodificado via ${geo.source}: ${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}`)
          } else {
            console.warn(`[Classifier] Geocodificação falhou para o pedido ${order.platform_order_code ?? order.id.slice(0, 8)}`)
          }
        }

        // Classifica com as coordenadas obtidas (se houver)
        const enrichedOrder = geocodedCoords
          ? { ...order, latitude: geocodedCoords.latitude, longitude: geocodedCoords.longitude }
          : order

        const result = classifyOrder(enrichedOrder)

        await supabase
          .from('orders')
          .update({
            route_eligibility:  result.route_eligibility,
            route_block_reason: result.route_block_reason,
            status:             result.status,
            // Persiste as coordenadas geocodificadas junto com a classificação
            ...(geocodedCoords ?? {}),
          })
          .eq('id', order.id)
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
