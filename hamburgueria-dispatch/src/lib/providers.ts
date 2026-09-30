// Provider abstraction for the routing service used to draw and re-time
// routes on screen. Geocoding moved to the dispatch-engine Edge Function.
// Swap implementations without touching domain logic.

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

// ── Singleton instance (swap here to change provider) ─────────────────────────

export const routingProvider: RoutingProvider = new OsrmRoutingProvider()
