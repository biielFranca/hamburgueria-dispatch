import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const subscribe = vi.fn(() => channelInstance)
  const on        = vi.fn(() => channelInstance)
  const channelInstance: any = { on, subscribe }
  const channel = vi.fn(() => channelInstance)
  const removeChannel = vi.fn()
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
  }))
  return { supabase: { channel, removeChannel, from }, channel, removeChannel, on, subscribe, channelInstance }
})

vi.mock('./supabase', () => ({ supabase: mocks.supabase }))
vi.mock('./geocoder', () => ({ geocodeOrderAddress: vi.fn() }))
vi.mock('./routeEngine', () => ({ runRouteEngine: vi.fn() }))

import { startClassifier } from './classifier'

describe('startClassifier (Realtime subscription)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset module-level channel singleton
    const stop = startClassifier('store-x')
    stop()
    vi.clearAllMocks()
  })

  it('creates a channel with storeId-scoped name', () => {
    const stop = startClassifier('store-123')
    expect(mocks.channel).toHaveBeenCalledWith('classifier-store-123')
    stop()
  })

  it('subscribes to INSERT events on orders table', () => {
    const stop = startClassifier('s1')
    expect(mocks.on).toHaveBeenCalled()
    const [eventType, config] = mocks.on.mock.calls[0] as [string, Record<string, unknown>]
    expect(eventType).toBe('postgres_changes')
    expect(config).toMatchObject({ event: 'INSERT', schema: 'public', table: 'orders' })
    expect(mocks.subscribe).toHaveBeenCalled()
    stop()
  })

  it('is idempotent — second call while active is a no-op', () => {
    const stop1 = startClassifier('s1')
    const stop2 = startClassifier('s1')
    expect(mocks.channel).toHaveBeenCalledTimes(1)
    stop1()
    stop2() // inert
  })

  it('cleanup removes channel and allows new subscription', () => {
    const stop = startClassifier('s1')
    stop()
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1)
    // After stop, a new subscription should be allowed
    const stop2 = startClassifier('s2')
    expect(mocks.channel).toHaveBeenLastCalledWith('classifier-s2')
    stop2()
  })
})
