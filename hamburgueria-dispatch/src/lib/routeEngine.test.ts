import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}))

import {
  haversineKm,
  permutations,
  combinations,
  nearestNeighborOrder,
  selectBestGroup,
} from './routeEngine'
import type { Order } from '../types'

function makeOrder(id: string, lat: number, lng: number): Order {
  return {
    id,
    store_id: 's1',
    platform: 'ifood',
    platform_order_id: id,
    customer_name: 'X',
    address_street: 'Rua',
    items: [],
    total_amount: 0,
    delivery_type: 'delivery',
    logistics_type: 'own',
    status: 'awaiting_route',
    rejection_count: 0,
    latitude: lat,
    longitude: lng,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(-23.5, -46.6, -23.5, -46.6)).toBeCloseTo(0, 5)
  })

  it('computes ~111 km for 1 degree of latitude', () => {
    const d = haversineKm(0, 0, 1, 0)
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })

  it('is symmetric (d(a,b) === d(b,a))', () => {
    const a = haversineKm(-23.5, -46.6, -23.6, -46.7)
    const b = haversineKm(-23.6, -46.7, -23.5, -46.6)
    expect(a).toBeCloseTo(b, 10)
  })

  it('computes known SP→RJ distance in reasonable range', () => {
    // São Paulo (-23.55, -46.63) to Rio (-22.91, -43.17)
    const d = haversineKm(-23.55, -46.63, -22.91, -43.17)
    expect(d).toBeGreaterThan(350)
    expect(d).toBeLessThan(370)
  })
})

describe('permutations', () => {
  it('returns [[]]-equivalent for empty array', () => {
    expect(permutations([])).toEqual([[]])
  })

  it('returns single perm for single element', () => {
    expect(permutations([1])).toEqual([[1]])
  })

  it('returns 2 perms for 2 elements', () => {
    expect(permutations([1, 2])).toHaveLength(2)
  })

  it('returns 6 perms for 3 elements', () => {
    expect(permutations([1, 2, 3])).toHaveLength(6)
  })

  it('returns 24 perms for 4 elements (n!)', () => {
    expect(permutations([1, 2, 3, 4])).toHaveLength(24)
  })

  it('all perms are unique', () => {
    const perms = permutations([1, 2, 3]).map(p => p.join(','))
    expect(new Set(perms).size).toBe(perms.length)
  })
})

describe('combinations', () => {
  it('returns [[]] for k=0', () => {
    expect(combinations([1, 2, 3], 0)).toEqual([[]])
  })

  it('returns empty when k > arr.length', () => {
    expect(combinations([1], 2)).toEqual([])
  })

  it('returns C(4,2) = 6 combos', () => {
    expect(combinations([1, 2, 3, 4], 2)).toHaveLength(6)
  })

  it('returns C(5,3) = 10 combos', () => {
    expect(combinations([1, 2, 3, 4, 5], 3)).toHaveLength(10)
  })

  it('preserves order within each combo', () => {
    const combos = combinations([1, 2, 3], 2)
    for (const c of combos) {
      expect(c).toEqual([...c].sort((a, b) => a - b))
    }
  })
})

describe('nearestNeighborOrder', () => {
  const store: [number, number] = [0, 0]

  it('returns empty array for empty input', () => {
    expect(nearestNeighborOrder(store, [])).toEqual([])
  })

  it('returns same order when only 1 order', () => {
    const o = makeOrder('a', 1, 1)
    expect(nearestNeighborOrder(store, [o])).toEqual([o])
  })

  it('picks closest order first', () => {
    const far = makeOrder('far', 10, 10)
    const near = makeOrder('near', 0.1, 0.1)
    const result = nearestNeighborOrder(store, [far, near])
    expect(result[0].id).toBe('near')
    expect(result[1].id).toBe('far')
  })

  it('chains nearest-neighbor across multiple orders', () => {
    // Store at (0,0); orders along a line heading away
    const a = makeOrder('a', 0.1, 0)   // closest to store
    const b = makeOrder('b', 0.2, 0)   // closest to a
    const c = makeOrder('c', 0.3, 0)   // closest to b
    const result = nearestNeighborOrder(store, [c, a, b])
    expect(result.map(o => o.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('selectBestGroup', () => {
  const store: [number, number] = [0, 0]

  it('returns empty when fewer than 2 orders', () => {
    expect(selectBestGroup([makeOrder('a', 1, 1)], store)).toEqual([])
  })

  it('groups 2 close orders rather than 2 distant ones', () => {
    const closeA = makeOrder('close-a', 0.1, 0.1)
    const closeB = makeOrder('close-b', 0.11, 0.11)
    const distant = makeOrder('distant', 5, 5)
    const group = selectBestGroup([closeA, closeB, distant], store)
    const ids = group.map(o => o.id).sort()
    expect(ids).toEqual(['close-a', 'close-b'])
  })

  it('prefers 3-order group when compact over any 2-order pair', () => {
    // 3 tightly clustered orders — per-order score lower than any 2-combo
    const a = makeOrder('a', 0.10, 0.10)
    const b = makeOrder('b', 0.11, 0.10)
    const c = makeOrder('c', 0.10, 0.11)
    const group = selectBestGroup([a, b, c], store)
    expect(group).toHaveLength(3)
  })

  it('caps group size at MAX_GROUP=3 even with more orders', () => {
    const orders = [
      makeOrder('a', 0.10, 0.10),
      makeOrder('b', 0.11, 0.10),
      makeOrder('c', 0.10, 0.11),
      makeOrder('d', 0.11, 0.11),
      makeOrder('e', 0.12, 0.12),
    ]
    const group = selectBestGroup(orders, store)
    expect(group.length).toBeLessThanOrEqual(3)
  })
})
