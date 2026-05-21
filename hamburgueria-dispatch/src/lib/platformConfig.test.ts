import { describe, it, expect } from 'vitest'
import { effectivePlatform, PLATFORM_COLORS, PLATFORM_LABELS, PLATFORMS } from './platformConfig'

describe('effectivePlatform', () => {
  it('falls back to ifood when order is null/undefined', () => {
    expect(effectivePlatform(null)).toBe('ifood')
    expect(effectivePlatform(undefined)).toBe('ifood')
  })

  it('returns platform when no source_channel is set', () => {
    expect(effectivePlatform({ platform: 'ifood' })).toBe('ifood')
    expect(effectivePlatform({ platform: 'keeta', source_channel: null })).toBe('keeta')
  })

  it('prefers source_channel over adapter platform for aggregated orders', () => {
    expect(effectivePlatform({ platform: 'ifood', source_channel: '99FOOD' })).toBe('99food')
    expect(effectivePlatform({ platform: '99food', source_channel: 'IFOOD' })).toBe('ifood')
    expect(effectivePlatform({ platform: 'ifood', source_channel: 'KEETA' })).toBe('keeta')
  })

  it('is case-insensitive on source_channel', () => {
    expect(effectivePlatform({ platform: '99food', source_channel: 'ifood' })).toBe('ifood')
    expect(effectivePlatform({ platform: 'keeta', source_channel: 'IfOoD' })).toBe('ifood')
  })

  it('falls back to ifood when adapter platform is unknown', () => {
    expect(effectivePlatform({ platform: 'unknown_future_channel' })).toBe('ifood')
  })

  it('returns a value guaranteed to have color/label entries', () => {
    const cases = [
      { platform: 'ifood' },
      { platform: 'ifood', source_channel: '99FOOD' },
      { platform: 'keeta', source_channel: 'unknown' },
      null,
    ] as const
    for (const c of cases) {
      const p = effectivePlatform(c)
      expect(PLATFORM_COLORS[p]).toBeTypeOf('string')
      expect(PLATFORM_LABELS[p]).toBeTypeOf('string')
    }
  })

  it('does not expose removed platforms', () => {
    const keys = PLATFORMS.map(p => p.key)
    expect(keys).toEqual(['ifood', 'keeta', '99food'])
    expect(keys).not.toContain('cardapio_web')
    expect(keys).not.toContain('aiqfome')
  })
})
