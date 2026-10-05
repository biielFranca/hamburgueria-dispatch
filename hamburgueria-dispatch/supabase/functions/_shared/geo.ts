// External geo services used by dispatch-engine: Nominatim (geocoding) and
// OSRM (route durations). Pure grouping rules live in ./domain/routing.ts.

import { type LatLng, nearestNeighborOrder, permutations, type Point } from './domain/routing.ts'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_HEADERS = { 'User-Agent': 'HamburgueriaDispatch/2.0', 'Accept-Language': 'pt-BR,pt;q=0.9' }
const OSRM_BASE    = Deno.env.get('ROUTES_API_URL') ?? 'https://router.project-osrm.org'
const OSRM_PROFILE = Deno.env.get('OSRM_PROFILE') ?? 'driving'
const TIMEOUT_MS   = 8_000

export interface AddressFields {
  address_street:       string | null
  address_number:       string | null
  address_neighborhood: string | null
  address_city:         string | null
  address_zip:          string | null
}

async function nominatim(params: URLSearchParams, signal: AbortSignal): Promise<LatLng | null> {
  const res = await fetch(`${NOMINATIM}?${params}`, { headers: NOMINATIM_HEADERS, signal })
  if (!res.ok) {
    // 403/429 = Nominatim throttling/blocking this runtime's IP
    console.warn('[geo] nominatim HTTP %d', res.status)
    await res.body?.cancel()
    return null
  }
  const data = await res.json()
  if (!Array.isArray(data) || !data.length) return null
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
}

/** Structured query first, free-text fallback. null when not found. */
export async function geocodeAddress(a: AddressFields): Promise<LatLng | null> {
  if (!a.address_street?.trim()) return null
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const streetWithNum = [a.address_number, a.address_street].filter(Boolean).join(' ')
    const structured = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'br', street: streetWithNum })
    if (a.address_city) structured.set('city', a.address_city)
    if (a.address_zip)  structured.set('postalcode', a.address_zip.replace(/\D/g, ''))
    const hit = await nominatim(structured, ctrl.signal)
    if (hit) return hit

    const parts = [streetWithNum, a.address_neighborhood, a.address_city, a.address_zip, 'Brasil'].filter(Boolean)
    if (parts.length < 2) return null
    return await nominatim(new URLSearchParams({ q: parts.join(', '), format: 'json', limit: '1', countrycodes: 'br' }), ctrl.signal)
  } catch (err) {
    console.warn('[geo] geocode failed:', err instanceof Error ? err.message : String(err))
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function routeDuration(coords: LatLng[]): Promise<number> {
  const path = coords.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${OSRM_BASE}/route/v1/${OSRM_PROFILE}/${path}?overview=false`, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const json = await res.json()
    if (!json.routes?.length) throw new Error('OSRM: no route')
    return json.routes[0].duration as number
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fastest visiting order by real road time: every permutation is priced by
 * OSRM (groups are ≤ 3 orders → ≤ 6 calls). Falls back to nearest-neighbour
 * by straight-line distance when OSRM is unavailable.
 */
export async function fastestSequence<T extends Point>(
  storeCoord: LatLng,
  orders: T[],
): Promise<{ sequence: T[]; durationSeconds: number | null }> {
  const perms = orders.length > 1 ? permutations(orders) : [orders]
  const settled = await Promise.allSettled(
    perms.map(p => routeDuration([storeCoord, ...p.map(o => [o.latitude!, o.longitude!] as LatLng)])),
  )
  let best = -1
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]
    if (r.status === 'fulfilled' && (best < 0 || r.value < (settled[best] as PromiseFulfilledResult<number>).value)) best = i
  }
  if (best < 0) return { sequence: nearestNeighborOrder(storeCoord, orders), durationSeconds: null }
  return { sequence: perms[best], durationSeconds: (settled[best] as PromiseFulfilledResult<number>).value }
}
