import { describe, it, expect } from 'vitest'
import { classifyOrder, needsGeocoding, type ClassifiableOrder } from './classify'

function makeOrder(overrides: Partial<ClassifiableOrder> = {}): ClassifiableOrder {
  return {
    address_street: 'Rua Teste',
    delivery_type: 'delivery',
    logistics_type: 'own',
    latitude: -23.5,
    longitude: -46.6,
    ...overrides,
  }
}

describe('classifyOrder', () => {
  it('blocks pickup orders with pickup_order reason', () => {
    const result = classifyOrder(makeOrder({ delivery_type: 'pickup' }))
    expect(result.route_eligibility).toBe('blocked')
    expect(result.route_block_reason).toBe('pickup_order')
    expect(result.status).toBe('normalized')
  })

  it('marks platform-managed logistics as external_monitoring', () => {
    const result = classifyOrder(makeOrder({ logistics_type: 'platform' }))
    expect(result.route_eligibility).toBe('external_monitoring')
    expect(result.route_block_reason).toBeNull()
    // 'external_monitoring' is not a valid orders.status (the old Edge copy used it)
    expect(result.status).toBe('normalized')
  })

  it('sets awaiting when latitude is missing', () => {
    const result = classifyOrder(makeOrder({ latitude: undefined }))
    expect(result.route_eligibility).toBe('awaiting')
    expect(result.route_block_reason).toBe('missing_coordinates')
  })

  it('sets awaiting when longitude is missing', () => {
    const result = classifyOrder(makeOrder({ longitude: undefined }))
    expect(result.route_eligibility).toBe('awaiting')
    expect(result.route_block_reason).toBe('missing_coordinates')
  })

  it('blocks when address_street is empty', () => {
    const result = classifyOrder(makeOrder({ address_street: '   ' }))
    expect(result.route_eligibility).toBe('blocked')
    expect(result.route_block_reason).toBe('invalid_address')
  })

  it('sets awaiting for scheduled orders more than 30 min in the future', () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString()
    const result = classifyOrder(makeOrder({ estimated_delivery_at: future }))
    expect(result.route_eligibility).toBe('awaiting')
    expect(result.route_block_reason).toBe('scheduled')
  })

  it('treats orders scheduled within 30 min as eligible', () => {
    const soon = new Date(Date.now() + 15 * 60_000).toISOString()
    const result = classifyOrder(makeOrder({ estimated_delivery_at: soon }))
    expect(result.route_eligibility).toBe('eligible')
    expect(result.status).toBe('awaiting_route')
  })

  it('returns eligible + awaiting_route for a valid delivery order', () => {
    const result = classifyOrder(makeOrder())
    expect(result.route_eligibility).toBe('eligible')
    expect(result.route_block_reason).toBeNull()
    expect(result.status).toBe('awaiting_route')
  })

  it('pickup takes priority over other invalid fields', () => {
    const result = classifyOrder(makeOrder({
      delivery_type: 'pickup',
      latitude: undefined,
      address_street: '',
    }))
    expect(result.route_eligibility).toBe('blocked')
    expect(result.route_block_reason).toBe('pickup_order')
  })

  it('platform logistics takes priority over missing coordinates', () => {
    const result = classifyOrder(makeOrder({
      logistics_type: 'platform',
      latitude: undefined,
    }))
    expect(result.route_eligibility).toBe('external_monitoring')
  })
})

describe('needsGeocoding', () => {
  it('is true only for own-delivery orders with a street but no coordinates', () => {
    expect(needsGeocoding(makeOrder({ latitude: null }))).toBe(true)
    expect(needsGeocoding(makeOrder())).toBe(false)
    expect(needsGeocoding(makeOrder({ latitude: null, logistics_type: 'platform' }))).toBe(false)
    expect(needsGeocoding(makeOrder({ latitude: null, delivery_type: 'pickup' }))).toBe(false)
    expect(needsGeocoding(makeOrder({ latitude: null, address_street: ' ' }))).toBe(false)
  })
})
