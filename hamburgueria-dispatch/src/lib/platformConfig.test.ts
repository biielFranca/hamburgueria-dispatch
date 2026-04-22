import { describe, it, expect } from 'vitest'
import { effectivePlatform, PLATFORM_COLORS, PLATFORM_LABELS } from './platformConfig'

describe('effectivePlatform', () => {
  it('falls back to cardapio_web when order is null/undefined', () => {
    expect(effectivePlatform(null)).toBe('cardapio_web')
    expect(effectivePlatform(undefined)).toBe('cardapio_web')
  })

  it('returns platform when no source_channel is set', () => {
    expect(effectivePlatform({ platform: 'ifood' })).toBe('ifood')
    expect(effectivePlatform({ platform: 'keeta', source_channel: null })).toBe('keeta')
  })

  it('prefers source_channel over adapter platform for aggregated orders', () => {
    expect(effectivePlatform({ platform: 'cardapio_web', source_channel: '99FOOD' })).toBe('99food')
    expect(effectivePlatform({ platform: 'cardapio_web', source_channel: 'IFOOD' })).toBe('ifood')
    expect(effectivePlatform({ platform: 'cardapio_web', source_channel: 'KEETA' })).toBe('keeta')
    expect(effectivePlatform({ platform: 'cardapio_web', source_channel: 'AIQFOME' })).toBe('aiqfome')
  })

  it('maps CARDAPIO_WEB_OWN source_channel back to cardapio_web', () => {
    expect(
      effectivePlatform({ platform: 'cardapio_web', source_channel: 'CARDAPIO_WEB_OWN' }),
    ).toBe('cardapio_web')
  })

  it('is case-insensitive on source_channel', () => {
    expect(effectivePlatform({ platform: 'cardapio_web', source_channel: 'ifood' })).toBe('ifood')
    expect(effectivePlatform({ platform: 'cardapio_web', source_channel: 'IfOoD' })).toBe('ifood')
  })

  it('falls back to cardapio_web when adapter platform is unknown', () => {
    expect(effectivePlatform({ platform: 'unknown_future_channel' })).toBe('cardapio_web')
  })

  it('returns a value guaranteed to have color/label entries', () => {
    const cases = [
      { platform: 'ifood' },
      { platform: 'cardapio_web', source_channel: '99FOOD' },
      { platform: 'cardapio_web', source_channel: 'AIQFOME' },
      { platform: 'cardapio_web', source_channel: 'unknown' },
      null,
    ] as const
    for (const c of cases) {
      const p = effectivePlatform(c)
      expect(PLATFORM_COLORS[p]).toBeTypeOf('string')
      expect(PLATFORM_LABELS[p]).toBeTypeOf('string')
    }
  })
})
