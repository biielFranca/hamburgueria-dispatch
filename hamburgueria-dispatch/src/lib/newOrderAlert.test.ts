import { describe, it, expect } from 'vitest'
import { shouldAlertNewOrder, isOrderClosed, NEW_ORDER_MAX_AGE_MS } from './newOrderAlert'

const NOW = Date.parse('2026-09-25T20:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('shouldAlertNewOrder', () => {
  it('rings for an order that just arrived', () => {
    expect(shouldAlertNewOrder({ status: 'received', created_at: ago(5_000), updated_at: ago(5_000) }, NOW)).toBe(true)
  })

  it('ignores an order that arrived more than the max age ago', () => {
    const t = ago(NEW_ORDER_MAX_AGE_MS + 1_000)
    expect(shouldAlertNewOrder({ status: 'normalized', created_at: t, updated_at: t }, NOW)).toBe(false)
  })

  it('judges by arrival (updated_at), not by the platform order time', () => {
    // iFood order placed 10 min ago but synced into the DB just now
    expect(shouldAlertNewOrder({ status: 'awaiting_route', created_at: ago(10 * 60_000), updated_at: ago(3_000) }, NOW)).toBe(true)
  })

  it('falls back to created_at when updated_at is missing', () => {
    expect(shouldAlertNewOrder({ status: 'received', created_at: ago(10 * 60_000) }, NOW)).toBe(false)
    expect(shouldAlertNewOrder({ status: 'received', created_at: ago(10_000), updated_at: null }, NOW)).toBe(true)
  })

  it('treats a timestamp in the future (clock skew) as fresh', () => {
    expect(shouldAlertNewOrder({ status: 'received', created_at: ago(-30_000), updated_at: ago(-30_000) }, NOW)).toBe(true)
  })

  it('rings when the timestamp is unparseable', () => {
    expect(shouldAlertNewOrder({ status: 'received', created_at: 'garbage' }, NOW)).toBe(true)
  })

  it('never rings for closed orders', () => {
    for (const status of ['dispatched', 'delivered', 'cancelled'] as const) {
      expect(shouldAlertNewOrder({ status, created_at: ago(0), updated_at: ago(0) }, NOW)).toBe(false)
    }
  })
})

describe('isOrderClosed', () => {
  it('is true only for dispatched, delivered and cancelled', () => {
    expect(isOrderClosed('dispatched')).toBe(true)
    expect(isOrderClosed('delivered')).toBe(true)
    expect(isOrderClosed('cancelled')).toBe(true)
    expect(isOrderClosed('received')).toBe(false)
    expect(isOrderClosed('in_suggestion')).toBe(false)
    expect(isOrderClosed('dispatch_timeout')).toBe(false)
  })
})
