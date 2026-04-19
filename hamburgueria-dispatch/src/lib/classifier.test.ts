import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}))
vi.mock('./geocoder', () => ({ geocodeOrderAddress: vi.fn() }))
vi.mock('./routeEngine', () => ({ runRouteEngine: vi.fn() }))

import { classifyOrder } from './classifier'
import type { Order } from '../types'

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    store_id: 's1',
    platform: 'ifood',
    platform_order_id: 'p1',
    customer_name: 'Test',
    address_street: 'Rua Teste',
    address_number: '100',
    items: [],
    total_amount: 50,
    delivery_type: 'delivery',
    logistics_type: 'own',
    status: 'normalized',
    rejection_count: 0,
    latitude: -23.5,
    longitude: -46.6,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
