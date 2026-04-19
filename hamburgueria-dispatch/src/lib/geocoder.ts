// Geocoding via the injected GeocodingProvider (default: Nominatim).
// All provider details live in providers.ts — swap without touching callers.

import { geocodingProvider, type GeoResult } from './providers'

export type { GeoResult }

export async function geocodeOrderAddress(
  street:       string,
  number:       string | null | undefined,
  neighborhood: string | null | undefined,
  city:         string | null | undefined,
  zip:          string | null | undefined,
): Promise<GeoResult | null> {
  return geocodingProvider.geocode(street, number, neighborhood, city, zip)
}
