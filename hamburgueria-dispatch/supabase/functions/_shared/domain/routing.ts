// Route grouping rules — the single implementation (roadmap 1.2).
// Pure: no Supabase, fetch or Deno APIs, no imports. Used by the
// dispatch-engine Edge Function, by the Operational screen (editing a
// suggestion) and tested with Vitest.

export interface Point {
  latitude?:  number | null
  longitude?: number | null
}

export type LatLng = [number, number]

/** Max deliveries per suggestion. */
export const MAX_GROUP = 3
/** After this many operator rejections an order stops being suggested. */
export const MAX_REJECTIONS = 3

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

/** Greedy nearest-neighbour visiting order starting at the store. */
export function nearestNeighborOrder<T extends Point>(storeCoord: LatLng, orders: T[]): T[] {
  let pos = storeCoord
  const remaining = [...orders]
  const result: T[] = []
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

function nearestNeighborDistance(storeCoord: LatLng, orders: Point[]): number {
  let pos = storeCoord
  let total = 0
  for (const o of nearestNeighborOrder(storeCoord, orders)) {
    total += haversineKm(pos[0], pos[1], o.latitude!, o.longitude!)
    pos = [o.latitude!, o.longitude!]
  }
  return total
}

/**
 * Among all 2..MAX_GROUP-order subsets, the one with the lowest distance per
 * delivery. Compact groups of 3 win over scattered pairs; bad groupings are
 * never forced. Returns [] when fewer than 2 orders.
 */
export function selectBestGroup<T extends Point>(orders: T[], storeCoord: LatLng): T[] {
  let bestScore = Infinity
  let bestGroup: T[] = []
  for (let size = Math.min(MAX_GROUP, orders.length); size >= 2; size--) {
    for (const group of combinations(orders, size)) {
      const score = nearestNeighborDistance(storeCoord, group) / group.length
      if (score < bestScore) { bestScore = score; bestGroup = group }
    }
  }
  return bestGroup
}

export interface PlannableOrder extends Point {
  id:              string
  created_at:      string
  rejection_count: number
}

export interface RoutePlan<T> {
  /** Orders that hit MAX_REJECTIONS — to be marked dispatch_timeout. */
  timedOut: T[]
  /** Groups to turn into suggestions, in creation order. */
  groups:   T[][]
  /** A lone order still inside its solo wait window, if any. */
  waiting:  T | null
}

/**
 * Splits the store's awaiting_route orders into suggestions. Several pending
 * suggestions per store are allowed (owner decision, 26/set/2026): keep
 * grouping while 2+ orders remain; a lone order is only suggested alone after
 * waiting `soloWaitMs` for a partner. Orders without coordinates are ignored.
 */
export function planRoutes<T extends PlannableOrder>(
  orders: T[],
  storeCoord: LatLng,
  now: number,
  soloWaitMs: number,
): RoutePlan<T> {
  const timedOut = orders.filter(o => (o.rejection_count ?? 0) >= MAX_REJECTIONS)
  let pool = orders.filter(o =>
    (o.rejection_count ?? 0) < MAX_REJECTIONS && o.latitude != null && o.longitude != null)

  const groups: T[][] = []
  while (pool.length >= 2) {
    const group = selectBestGroup(pool, storeCoord)
    groups.push(group)
    const taken = new Set(group.map(o => o.id))
    pool = pool.filter(o => !taken.has(o.id))
  }

  let waiting: T | null = null
  if (pool.length === 1) {
    const solo = pool[0]
    if (now - new Date(solo.created_at).getTime() >= soloWaitMs) groups.push([solo])
    else waiting = solo
  }

  return { timedOut, groups, waiting }
}
