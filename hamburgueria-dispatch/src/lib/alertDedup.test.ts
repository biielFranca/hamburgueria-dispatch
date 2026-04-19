import { describe, it, expect } from 'vitest'
import { alertKey, markIfNew, pruneAlerts, levelFromAge, type AlertKey } from './alertDedup'

describe('alertKey', () => {
  it('formats as orderId:level', () => {
    expect(alertKey('order-1', '5min')).toBe('order-1:5min')
    expect(alertKey('abc', 'critical')).toBe('abc:critical')
  })
})

describe('markIfNew', () => {
  it('returns true on first call and adds to set', () => {
    const seen = new Set<AlertKey>()
    expect(markIfNew(seen, 'o1', '5min')).toBe(true)
    expect(seen.has('o1:5min' as AlertKey)).toBe(true)
  })

  it('returns false when called again with same key', () => {
    const seen = new Set<AlertKey>()
    markIfNew(seen, 'o1', '5min')
    expect(markIfNew(seen, 'o1', '5min')).toBe(false)
  })

  it('treats different levels for same order as distinct', () => {
    const seen = new Set<AlertKey>()
    expect(markIfNew(seen, 'o1', '5min')).toBe(true)
    expect(markIfNew(seen, 'o1', '1min')).toBe(true)
    expect(markIfNew(seen, 'o1', 'critical')).toBe(true)
    expect(seen.size).toBe(3)
  })

  it('treats different orders at same level as distinct', () => {
    const seen = new Set<AlertKey>()
    markIfNew(seen, 'o1', '5min')
    expect(markIfNew(seen, 'o2', '5min')).toBe(true)
  })
})

describe('pruneAlerts', () => {
  it('keeps entries for active orders', () => {
    const seen = new Set<AlertKey>(['o1:5min', 'o2:5min'] as AlertKey[])
    const next = pruneAlerts(seen, ['o1', 'o2'])
    expect(next.size).toBe(2)
  })

  it('drops entries for orders no longer active', () => {
    const seen = new Set<AlertKey>(['o1:5min', 'o2:critical', 'o3:1min'] as AlertKey[])
    const next = pruneAlerts(seen, ['o1'])
    expect(next.size).toBe(1)
    expect(next.has('o1:5min' as AlertKey)).toBe(true)
  })

  it('returns empty set when no orders are active', () => {
    const seen = new Set<AlertKey>(['o1:5min', 'o2:1min'] as AlertKey[])
    const next = pruneAlerts(seen, [])
    expect(next.size).toBe(0)
  })

  it('does not mutate original set', () => {
    const seen = new Set<AlertKey>(['o1:5min'] as AlertKey[])
    pruneAlerts(seen, [])
    expect(seen.size).toBe(1)
  })
})

describe('levelFromAge', () => {
  const thresholds = { warning: 5 * 60_000, urgent: 9 * 60_000, overdue: 10 * 60_000 }

  it('returns null below warning threshold', () => {
    expect(levelFromAge(0, thresholds)).toBeNull()
    expect(levelFromAge(4 * 60_000, thresholds)).toBeNull()
  })

  it('returns 5min at warning threshold', () => {
    expect(levelFromAge(5 * 60_000, thresholds)).toBe('5min')
    expect(levelFromAge(8 * 60_000, thresholds)).toBe('5min')
  })

  it('returns 1min at urgent threshold', () => {
    expect(levelFromAge(9 * 60_000, thresholds)).toBe('1min')
    expect(levelFromAge(9.9 * 60_000, thresholds)).toBe('1min')
  })

  it('returns critical at overdue threshold', () => {
    expect(levelFromAge(10 * 60_000, thresholds)).toBe('critical')
    expect(levelFromAge(60 * 60_000, thresholds)).toBe('critical')
  })
})
