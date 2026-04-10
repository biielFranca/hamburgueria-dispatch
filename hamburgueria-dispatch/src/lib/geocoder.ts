// ── Geocoder via Nominatim (OpenStreetMap) ────────────────────────────────────
//
// Converte endereço brasileiro (CEP + número) em coordenadas lat/lng.
// Usa duas estratégias em sequência:
//   1. Query estruturada: postalcode + número + rua + cidade (mais precisa)
//   2. Fallback texto livre: "número rua, bairro, cidade, CEP"
//
// Nominatim é gratuito, sem chave de API, mas tem rate limit de 1 req/s.
// Para produção de alto volume, considere Here, Google Maps ou Mapbox.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

const FETCH_OPTS: RequestInit = {
  headers: {
    'User-Agent':       'HamburgueriaDispatch/1.0',
    'Accept-Language':  'pt-BR,pt;q=0.9',
  },
}

export interface GeoResult {
  latitude:  number
  longitude: number
  source:    'structured' | 'freetext'  // qual estratégia funcionou
}

// ── Query estruturada ─────────────────────────────────────────────────────────

async function geocodeStructured(
  street:       string,
  number:       string | null | undefined,
  city:         string | null | undefined,
  zip:          string | null | undefined,
): Promise<GeoResult | null> {
  const streetWithNum = [number, street].filter(Boolean).join(' ')
  const params = new URLSearchParams({
    format:       'json',
    limit:        '1',
    countrycodes: 'br',
  })
  if (streetWithNum) params.set('street', streetWithNum)
  if (city)          params.set('city',   city)
  if (zip)           params.set('postalcode', zip.replace(/\D/g, ''))

  try {
    const res = await fetch(`${NOMINATIM}?${params}`, FETCH_OPTS)
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return {
      latitude:  parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
      source:    'structured',
    }
  } catch {
    return null
  }
}

// ── Query texto livre (fallback) ──────────────────────────────────────────────

async function geocodeFreetext(
  street:       string,
  number:       string | null | undefined,
  neighborhood: string | null | undefined,
  city:         string | null | undefined,
  zip:          string | null | undefined,
): Promise<GeoResult | null> {
  const parts = [
    [number, street].filter(Boolean).join(' '),
    neighborhood,
    city,
    zip,
    'Brasil',
  ].filter(Boolean)

  if (parts.length < 2) return null

  const params = new URLSearchParams({
    q:            parts.join(', '),
    format:       'json',
    limit:        '1',
    countrycodes: 'br',
  })

  try {
    const res = await fetch(`${NOMINATIM}?${params}`, FETCH_OPTS)
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return {
      latitude:  parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
      source:    'freetext',
    }
  } catch {
    return null
  }
}

// ── Ponto de entrada principal ────────────────────────────────────────────────

export async function geocodeOrderAddress(
  street:       string,
  number:       string | null | undefined,
  neighborhood: string | null | undefined,
  city:         string | null | undefined,
  zip:          string | null | undefined,
): Promise<GeoResult | null> {
  // Precisa pelo menos da rua para tentar geocodificar
  if (!street?.trim()) return null

  // Estratégia 1: query estruturada (mais precisa com CEP brasileiro)
  const structured = await geocodeStructured(street, number, city, zip)
  if (structured) return structured

  // Estratégia 2: texto livre com bairro como desambiguação
  const freetext = await geocodeFreetext(street, number, neighborhood, city, zip)
  return freetext
}
