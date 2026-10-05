// MapTiler Geocoding API — pure request/response handling, no Deno APIs, so
// it runs in Edge Functions and in Vitest. I/O lives in ./geo.ts.
// Docs: docs.maptiler.com/cloud/api/geocoding (forward geocoding).

export interface AddressLike {
  address_street:       string | null
  address_number:       string | null
  address_neighborhood: string | null
  address_city:         string | null
  address_zip:          string | null
}

/**
 * Feature types precise enough to route a courier to. A bare city/region
 * match returns the city's centre — worse than no coordinate, since it would
 * group and time the delivery as if it were somewhere else.
 */
const PRECISE_TYPES = new Set(['address', 'street', 'road', 'postal_code', 'poi'])

/** "100 Rua X, Bairro, Cidade, 01234-567, Brasil" — free text, as the API expects. */
export function maptilerQuery(a: AddressLike): string | null {
  // A house number alone locates nothing — the street is required
  if (!a.address_street?.trim()) return null
  const street = [a.address_street.trim(), a.address_number?.trim()].filter(Boolean).join(' ')
  return [street, a.address_neighborhood?.trim(), a.address_city?.trim(), a.address_zip?.trim(), 'Brasil']
    .filter(Boolean).join(', ')
}

export function maptilerUrl(query: string, key: string, proximity?: [number, number]): string {
  const params = new URLSearchParams({ key, country: 'br', language: 'pt', limit: '1', autocomplete: 'false' })
  // proximity is lng,lat — biases ties (same street name in two cities) toward the store
  if (proximity) params.set('proximity', `${proximity[1]},${proximity[0]}`)
  return `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params}`
}

/** [lat, lng] of the best feature, or null when absent or not precise enough. */
export function pickMaptilerPoint(json: any): [number, number] | null {
  const f = json?.features?.[0]
  if (!f) return null
  const types: string[] = Array.isArray(f.place_type) ? f.place_type : []
  if (!types.some(t => PRECISE_TYPES.has(t))) return null
  const c = Array.isArray(f.center) ? f.center : f.geometry?.coordinates
  if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null
  return [c[1], c[0]]
}
