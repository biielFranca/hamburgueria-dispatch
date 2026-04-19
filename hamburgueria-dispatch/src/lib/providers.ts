// Provider abstractions for external geocoding and routing services.
// Swap implementations without touching domain logic.

// ── Geocoding ─────────────────────────────────────────────────────────────────

export interface GeoResult {
  latitude:  number
  longitude: number
  source:    string
}

export interface GeocodingProvider {
  geocode(
    street:       string,
    number:       string | null | undefined,
    neighborhood: string | null | undefined,
    city:         string | null | undefined,
    zip:          string | null | undefined,
  ): Promise<GeoResult | null>
}

// ── Routing ───────────────────────────────────────────────────────────────────

export interface RouteResult {
  duration: number   // seconds
  distance: number   // metres
}

export interface RouteGeometry {
  coords: [number, number][]  // [lat, lng] pairs (Leaflet format)
}

export interface RoutingProvider {
  getRouteDuration(coords: [number, number][]): Promise<RouteResult>
  getRouteGeometry(coords: [number, number][]): Promise<RouteGeometry>
}

// ── Nominatim implementation ──────────────────────────────────────────────────

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_HEADERS = {
  'User-Agent':      'HamburgueriaDispatch/2.0',
  'Accept-Language': 'pt-BR,pt;q=0.9',
}
const GEOCODE_TIMEOUT_MS = 8_000

export class NominatimGeocodingProvider implements GeocodingProvider {
  async geocode(
    street:       string,
    number:       string | null | undefined,
    neighborhood: string | null | undefined,
    city:         string | null | undefined,
    zip:          string | null | undefined,
  ): Promise<GeoResult | null> {
    if (!street?.trim()) return null

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS)

    try {
      const structured = await this._structured(street, number, city, zip, controller.signal)
      if (structured) { clearTimeout(timer); return structured }

      const freetext = await this._freetext(street, number, neighborhood, city, zip, controller.signal)
      clearTimeout(timer)
      return freetext
    } catch {
      clearTimeout(timer)
      return null
    }
  }

  private async _structured(
    street: string,
    number: string | null | undefined,
    city:   string | null | undefined,
    zip:    string | null | undefined,
    signal: AbortSignal,
  ): Promise<GeoResult | null> {
    const params = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'br' })
    const streetWithNum = [number, street].filter(Boolean).join(' ')
    if (streetWithNum) params.set('street', streetWithNum)
    if (city) params.set('city', city)
    if (zip)  params.set('postalcode', zip.replace(/\D/g, ''))

    try {
      const res = await fetch(`${NOMINATIM_BASE}?${params}`, { headers: NOMINATIM_HEADERS, signal })
      if (!res.ok) return null
      const data = await res.json()
      if (!Array.isArray(data) || !data.length) return null
      return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon), source: 'nominatim_structured' }
    } catch {
      return null
    }
  }

  private async _freetext(
    street:       string,
    number:       string | null | undefined,
    neighborhood: string | null | undefined,
    city:         string | null | undefined,
    zip:          string | null | undefined,
    signal:       AbortSignal,
  ): Promise<GeoResult | null> {
    const parts = [[number, street].filter(Boolean).join(' '), neighborhood, city, zip, 'Brasil'].filter(Boolean)
    if (parts.length < 2) return null

    const params = new URLSearchParams({ q: parts.join(', '), format: 'json', limit: '1', countrycodes: 'br' })

    try {
      const res = await fetch(`${NOMINATIM_BASE}?${params}`, { headers: NOMINATIM_HEADERS, signal })
      if (!res.ok) return null
      const data = await res.json()
      if (!Array.isArray(data) || !data.length) return null
      return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon), source: 'nominatim_freetext' }
    } catch {
      return null
    }
  }
}

// ── OSRM implementation ───────────────────────────────────────────────────────

const ROUTE_TIMEOUT_MS = 10_000

export class OsrmRoutingProvider implements RoutingProvider {
  private readonly base: string
  private readonly profile: string

  constructor(
    base    = import.meta.env.VITE_ROUTES_API_URL ?? 'https://router.project-osrm.org',
    profile = import.meta.env.VITE_OSRM_PROFILE   ?? 'driving',
  ) {
    this.base    = base
    this.profile = profile
  }

  async getRouteDuration(coords: [number, number][]): Promise<RouteResult> {
    const coordStr = coords.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const url = `${this.base}/route/v1/${this.profile}/${coordStr}?overview=false`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS)

    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`OSRM ${res.status}`)
      const json = await res.json()
      if (!json.routes?.length) throw new Error('No route found')
      return { duration: json.routes[0].duration, distance: json.routes[0].distance }
    } catch (err) {
      clearTimeout(timer)
      throw err
    }
  }

  async getRouteGeometry(coords: [number, number][]): Promise<RouteGeometry> {
    const coordStr = coords.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const url = `${this.base}/route/v1/${this.profile}/${coordStr}?overview=full&geometries=geojson`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS)

    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`OSRM geometry ${res.status}`)
      const json = await res.json()
      if (!json.routes?.length) throw new Error('No route found')
      const leaflet: [number, number][] = (json.routes[0].geometry.coordinates as [number, number][])
        .map(([lng, lat]) => [lat, lng])
      return { coords: leaflet }
    } catch (err) {
      clearTimeout(timer)
      throw err
    }
  }
}

// ── Singleton instances (swap here to change provider) ────────────────────────

export const geocodingProvider: GeocodingProvider = new NominatimGeocodingProvider()
export const routingProvider:   RoutingProvider   = new OsrmRoutingProvider()
