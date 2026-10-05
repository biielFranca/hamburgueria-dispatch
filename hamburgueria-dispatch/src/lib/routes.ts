// Route helpers for the Operational screen: drawing a route on the map and
// re-timing a suggestion the operator is editing. Building suggestions is the
// dispatch-engine Edge Function's job (roadmap 1.2); the grouping rules are
// shared with it from supabase/functions/_shared/domain/routing.ts.

import { routingProvider } from './providers'
import { nearestNeighborOrder, permutations, type LatLng, type Point } from '../../supabase/functions/_shared/domain/routing.ts'

/**
 * Real road geometry for the map, as [lat, lng] pairs (Leaflet format).
 * Throws on error — caller falls back to straight lines.
 */
export async function fetchRouteGeometry(coords: LatLng[]): Promise<LatLng[]> {
  const result = await routingProvider.getRouteGeometry(coords)
  return result.coords
}

/**
 * Fastest visiting order by road time (every permutation; groups are small).
 * Falls back to nearest-neighbour when the routing service is unavailable.
 */
export async function findOptimalSequence<T extends Point>(
  storeCoord: LatLng,
  orders: T[],
): Promise<{ sequence: T[]; durationSeconds: number | null }> {
  if (orders.length === 0) return { sequence: [], durationSeconds: null }

  const perms = orders.length > 1 ? permutations(orders) : [orders]
  const settled = await Promise.allSettled(
    perms.map(p => routingProvider.getRouteDuration([storeCoord, ...p.map(o => [o.latitude!, o.longitude!] as LatLng)])),
  )

  let best = -1
  let bestDuration = Infinity
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.duration < bestDuration) { best = i; bestDuration = r.value.duration }
  })

  if (best < 0) return { sequence: nearestNeighborOrder(storeCoord, orders), durationSeconds: null }
  return { sequence: perms[best], durationSeconds: bestDuration }
}
