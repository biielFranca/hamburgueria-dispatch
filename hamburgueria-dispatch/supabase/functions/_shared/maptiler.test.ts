import { describe, it, expect } from 'vitest'
import { maptilerQuery, maptilerUrl, pickMaptilerPoint } from './maptiler'

const addr = {
  address_street: 'Avenida Casa Verde', address_number: '1000', address_neighborhood: 'Casa Verde',
  address_city: 'São Paulo', address_zip: '02519-000',
}

describe('maptilerQuery', () => {
  it('builds a free-text address', () => {
    expect(maptilerQuery(addr)).toBe('Avenida Casa Verde 1000, Casa Verde, São Paulo, 02519-000, Brasil')
  })

  it('skips empty parts and refuses an address without street', () => {
    expect(maptilerQuery({ ...addr, address_number: null, address_neighborhood: ' ' }))
      .toBe('Avenida Casa Verde, São Paulo, 02519-000, Brasil')
    expect(maptilerQuery({ ...addr, address_street: null })).toBeNull()
  })
})

describe('maptilerUrl', () => {
  it('limits to Brazil, one result, and biases toward the store (lng,lat)', () => {
    const u = new URL(maptilerUrl('Rua A 1, São Paulo', 'k', [-23.48, -46.66]))
    expect(u.pathname).toBe('/geocoding/' + encodeURIComponent('Rua A 1, São Paulo') + '.json')
    expect(u.searchParams.get('country')).toBe('br')
    expect(u.searchParams.get('limit')).toBe('1')
    expect(u.searchParams.get('proximity')).toBe('-46.66,-23.48')
    expect(u.searchParams.get('key')).toBe('k')
  })
})

describe('pickMaptilerPoint', () => {
  const feature = (place_type: string[], center = [-46.6512, -23.5025]) => ({ features: [{ place_type, center }] })

  it('returns [lat, lng] for address-precise results', () => {
    expect(pickMaptilerPoint(feature(['address']))).toEqual([-23.5025, -46.6512])
    expect(pickMaptilerPoint(feature(['street']))).toEqual([-23.5025, -46.6512])
    expect(pickMaptilerPoint(feature(['postal_code']))).toEqual([-23.5025, -46.6512])
  })

  it('rejects city/region-level matches (their centre is not the customer)', () => {
    expect(pickMaptilerPoint(feature(['municipality']))).toBeNull()
    expect(pickMaptilerPoint(feature(['region']))).toBeNull()
  })

  it('falls back to geometry.coordinates and handles empty results', () => {
    expect(pickMaptilerPoint({ features: [{ place_type: ['address'], geometry: { coordinates: [-46.6, -23.5] } }] }))
      .toEqual([-23.5, -46.6])
    expect(pickMaptilerPoint({ features: [] })).toBeNull()
    expect(pickMaptilerPoint(null)).toBeNull()
  })
})
