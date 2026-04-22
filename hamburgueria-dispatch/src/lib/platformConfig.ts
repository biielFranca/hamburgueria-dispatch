import type { Platform } from '../types'

export const PLATFORM_COLORS: Record<Platform, string> = {
  ifood:        '#EA1D2C',
  keeta:        '#27AE60',
  '99food':     '#F5A623',
  cardapio_web: '#8B5CF6',
  aiqfome:      '#E84C3D',
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  ifood:        'iFood',
  keeta:        'Keeta',
  '99food':     '99Food',
  cardapio_web: 'Cardápio Web',
  aiqfome:      'aiqfome',
}

export const PLATFORM_LABELS_SHORT: Record<Platform, string> = {
  ifood:        'iFood',
  keeta:        'Keeta',
  '99food':     '99Food',
  cardapio_web: 'Cárd. Web',
  aiqfome:      'aiqfome',
}

export const PLATFORM_FALLBACK_COLOR = '#666677'

export function platformColor(platform: Platform | string | null | undefined): string {
  if (!platform) return PLATFORM_FALLBACK_COLOR
  return PLATFORM_COLORS[platform as Platform] ?? PLATFORM_FALLBACK_COLOR
}

export function platformLabel(platform: Platform | string | null | undefined, short = false): string {
  if (!platform) return '—'
  const map = short ? PLATFORM_LABELS_SHORT : PLATFORM_LABELS
  return map[platform as Platform] ?? String(platform)
}

export const PLATFORMS: { key: Platform; label: string; color: string }[] = (
  Object.keys(PLATFORM_COLORS) as Platform[]
).map(key => ({
  key,
  label: PLATFORM_LABELS[key],
  color: PLATFORM_COLORS[key],
}))

// Maps the real origin (`source_channel` from Cardápio Web aggregation,
// Open Delivery normalization, etc.) back onto a Platform key for UI
// display. Without this, a 99Food order that flowed through Cardápio Web
// would be labelled "Cardápio Web" on the map and orders list.
//
// source_channel values (uppercase, produced by openDelivery + cardapioWebNative):
//   IFOOD, 99FOOD, KEETA, AIQFOME, CARDAPIO_WEB_OWN
const SOURCE_CHANNEL_TO_PLATFORM: Record<string, Platform> = {
  IFOOD:            'ifood',
  '99FOOD':         '99food',
  KEETA:            'keeta',
  AIQFOME:          'aiqfome',
  CARDAPIO_WEB_OWN: 'cardapio_web',
}

const KNOWN_PLATFORMS: ReadonlySet<Platform> = new Set(
  Object.keys(PLATFORM_COLORS) as Platform[],
)

function isPlatform(value: string | null | undefined): value is Platform {
  return !!value && KNOWN_PLATFORMS.has(value as Platform)
}

/**
 * Resolves the UI-facing platform for an order, preferring the real origin
 * (`source_channel`, set by Open Delivery/Cardápio Web aggregation) over the
 * adapter `platform` column. Always returns a known `Platform` — unknown
 * values fall back to `cardapio_web` so colors/labels never break.
 */
export function effectivePlatform(
  order: { platform: string; source_channel?: string | null } | null | undefined,
): Platform {
  if (!order) return 'cardapio_web'
  const sc = order.source_channel?.toUpperCase()
  if (sc && SOURCE_CHANNEL_TO_PLATFORM[sc]) return SOURCE_CHANNEL_TO_PLATFORM[sc]
  if (isPlatform(order.platform)) return order.platform
  return 'cardapio_web'
}
