import { describe, it, expect } from 'vitest'
import {
  ACTIVE_ORDER_MAX_AGE_HOURS,
  ACTIVE_ORDER_MAX_AGE_MS,
  activeOrderCutoffIso,
} from './orderActivity'

describe('ACTIVE_ORDER_MAX_AGE constants', () => {
  it('ACTIVE_ORDER_MAX_AGE_HOURS is 8', () => {
    expect(ACTIVE_ORDER_MAX_AGE_HOURS).toBe(8)
  })

  it('ACTIVE_ORDER_MAX_AGE_MS equals 8 hours in milliseconds', () => {
    expect(ACTIVE_ORDER_MAX_AGE_MS).toBe(8 * 60 * 60 * 1000)
  })
})

describe('activeOrderCutoffIso', () => {
  it('returns a valid ISO string', () => {
    const result = activeOrderCutoffIso()
    expect(() => new Date(result)).not.toThrow()
    expect(new Date(result).toISOString()).toBe(result)
  })

  it('returns a timestamp exactly 8 hours before the given now', () => {
    const now = new Date('2026-01-01T12:00:00.000Z').getTime()
    const cutoff = activeOrderCutoffIso(now)
    expect(cutoff).toBe('2026-01-01T04:00:00.000Z')
  })

  it('uses Date.now() by default (result is in the past)', () => {
    const before = Date.now()
    const cutoff = new Date(activeOrderCutoffIso()).getTime()
    const after = Date.now()
    expect(cutoff).toBeLessThan(before)
    expect(cutoff).toBeCloseTo(before - ACTIVE_ORDER_MAX_AGE_MS, -2)
    // also verify it's not too far in the past (sanity upper bound)
    expect(cutoff).toBeGreaterThan(after - ACTIVE_ORDER_MAX_AGE_MS - 1000)
  })

  it('cutoff is 8h before provided timestamp', () => {
    const now = Date.now()
    const cutoff = new Date(activeOrderCutoffIso(now)).getTime()
    expect(cutoff).toBe(now - ACTIVE_ORDER_MAX_AGE_MS)
  })
})
