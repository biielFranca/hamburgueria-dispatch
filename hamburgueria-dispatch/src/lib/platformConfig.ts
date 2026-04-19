import type { Platform } from '../types'

export const PLATFORM_COLORS: Record<Platform, string> = {
  ifood:        '#EA1D2C',
  keeta:        '#27AE60',
  '99food':     '#F5A623',
  cardapio_web: '#8B5CF6',
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  ifood:        'iFood',
  keeta:        'Keeta',
  '99food':     '99Food',
  cardapio_web: 'Cardápio Web',
}

export const PLATFORM_LABELS_SHORT: Record<Platform, string> = {
  ifood:        'iFood',
  keeta:        'Keeta',
  '99food':     '99Food',
  cardapio_web: 'Cárd. Web',
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
