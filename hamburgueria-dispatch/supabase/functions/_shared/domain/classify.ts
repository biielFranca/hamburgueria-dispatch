// Order classification rules — the single implementation (roadmap 1.2).
// Pure: no Supabase, fetch or Deno APIs, no imports. Used by the
// dispatch-engine Edge Function and tested with Vitest.

export type RouteEligibility = 'eligible' | 'awaiting' | 'blocked' | 'external_monitoring'

export interface ClassificationResult {
  route_eligibility:  RouteEligibility
  route_block_reason: string | null
  status:             'normalized' | 'awaiting_route'
}

export interface ClassifiableOrder {
  delivery_type:          string
  logistics_type:         string
  latitude?:              number | null
  longitude?:             number | null
  address_street?:        string | null
  estimated_delivery_at?: string | null
}

/** Orders scheduled further ahead than this wait instead of being routed. */
export const SCHEDULED_HORIZON_MS = 30 * 60_000

export function classifyOrder(order: ClassifiableOrder, now = Date.now()): ClassificationResult {
  // Rule 1: pickup orders are never routed
  if (order.delivery_type === 'pickup') {
    return { route_eligibility: 'blocked', route_block_reason: 'pickup_order', status: 'normalized' }
  }

  // Rule 2: platform-managed logistics → only monitored, the platform delivers
  if (order.logistics_type === 'platform') {
    return { route_eligibility: 'external_monitoring', route_block_reason: null, status: 'normalized' }
  }

  // Rule 3: missing coordinates (geocoding already failed) → can't be routed
  if (order.latitude == null || order.longitude == null) {
    return { route_eligibility: 'awaiting', route_block_reason: 'missing_coordinates', status: 'normalized' }
  }

  // Rule 4: missing street address
  if (!order.address_street?.trim()) {
    return { route_eligibility: 'blocked', route_block_reason: 'invalid_address', status: 'normalized' }
  }

  // Rule 5: scheduled order — estimated delivery more than 30 min ahead
  if (order.estimated_delivery_at) {
    const eta = new Date(order.estimated_delivery_at).getTime()
    if (eta - now > SCHEDULED_HORIZON_MS) {
      return { route_eligibility: 'awaiting', route_block_reason: 'scheduled', status: 'normalized' }
    }
  }

  return { route_eligibility: 'eligible', route_block_reason: null, status: 'awaiting_route' }
}

/** Only orders the store delivers itself are worth geocoding. */
export function needsGeocoding(order: ClassifiableOrder): boolean {
  return order.delivery_type === 'delivery'
    && order.logistics_type === 'own'
    && (order.latitude == null || order.longitude == null)
    && !!order.address_street?.trim()
}
