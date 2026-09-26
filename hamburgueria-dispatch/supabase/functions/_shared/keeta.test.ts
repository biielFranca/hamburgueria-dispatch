import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  canonicalJson, keetaSignatureString, keetaSign, verifyKeetaSignature,
  keetaAction, encryptedFields, isKeetaOwnDelivery, normalizeKeetaOrder,
} from './keeta'

const SECRET = 'client-secret'
const hmac64 = (s: string) => createHmac('sha256', SECRET).update(s).digest('base64')

describe('canonicalJson (RFC 8785)', () => {
  it('sorts keys recursively and drops whitespace', () => {
    expect(canonicalJson({ b: 2, a: { d: [3, { z: 1, y: 2 }], c: 'x' } }))
      .toBe('{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":2}')
  })

  it('formats numbers like ECMAScript', () => {
    expect(canonicalJson({ n: 1.0, m: 99.99, e: 1e21 })).toBe('{"e":1e+21,"m":99.99,"n":1}')
  })
})

describe('keetaSignatureString — examples from the Keeta docs', () => {
  it('GET with query params', () => {
    expect(keetaSignatureString('https://api.example.com/v1/users', { page: '2', limit: '10', sort: 'name' }, ''))
      .toBe('https://api.example.com/v1/users&limit=10&page=2&sort=name')
  })

  it('POST with JSON body', () => {
    const body = canonicalJson({ userId: 123, productId: 456, quantity: 2 })
    // The docs' example keeps insertion order; JCS sorts keys
    expect(keetaSignatureString('https://api.example.com/v1/orders', {}, '{"userId":123,"productId":456,"quantity":2}'))
      .toBe('https://api.example.com/v1/orders&{"userId":123,"productId":456,"quantity":2}')
    expect(body).toBe('{"productId":456,"quantity":2,"userId":123}')
  })

  it('PUT with params and body', () => {
    expect(keetaSignatureString('https://api.example.com/v1/products', { version: 'v2', format: 'json' }, '{"name":"Product A","price":99.99}'))
      .toBe('https://api.example.com/v1/products&format=json&version=v2&{"name":"Product A","price":99.99}')
  })
})

describe('keetaSign / verifyKeetaSignature', () => {
  const url  = 'https://x.supabase.co/functions/v1/keeta-webhook/v1/newEvent'
  const base = 'https://x.supabase.co/functions/v1/keeta-webhook'
  const raw  = '{"eventType":"CREATED", "eventId":"e1","orderId":"o1"}'

  it('matches HMAC-SHA256 base64 from node:crypto', async () => {
    expect(await keetaSign(SECRET, 'abc')).toBe(hmac64('abc'))
  })

  it('accepts a signature over the raw body', async () => {
    expect(await verifyKeetaSignature(SECRET, [base, url], {}, raw, hmac64(`${url}&${raw}`))).toBe(true)
  })

  it('accepts a signature over the canonicalized body', async () => {
    const canon = '{"eventId":"e1","eventType":"CREATED","orderId":"o1"}'
    expect(await verifyKeetaSignature(SECRET, [base, url], {}, raw, hmac64(`${base}&${canon}`))).toBe(true)
  })

  it('rejects another secret, another URL, or no signature', async () => {
    const wrongSecret = createHmac('sha256', 'nope').update(`${url}&${raw}`).digest('base64')
    expect(await verifyKeetaSignature(SECRET, [url], {}, raw, wrongSecret)).toBe(false)
    expect(await verifyKeetaSignature(SECRET, [url], {}, raw, hmac64(`https://evil.example/v1/newEvent&${raw}`))).toBe(false)
    expect(await verifyKeetaSignature(SECRET, [url], {}, raw, null)).toBe(false)
    expect(await verifyKeetaSignature('', [url], {}, raw, hmac64(`${url}&${raw}`))).toBe(false)
  })
})

describe('keetaAction', () => {
  it('maps the order lifecycle', () => {
    expect(keetaAction({ eventType: 'CREATED' })).toBe('new')
    expect(keetaAction({ eventType: 'CANCELLED' })).toBe('cancelled')
    expect(keetaAction({ eventType: 'CONCLUDED' })).toBe('delivered')
    expect(keetaAction({ eventType: 'DELIVERED' })).toBe('delivered')
    expect(keetaAction({ eventType: 'CANCELLATION_REQUESTED' })).toBe('ignore')
    expect(keetaAction({ eventType: 'CONFIRMED' })).toBe('ignore')
  })
})

// Shaped after GET /v1/orders/{orderId} in the Keeta docs
const ORDER = {
  id: 'kt-123',
  type: 'DELIVERY',
  displayId: '0042',
  createdAt: '2026-09-26T15:00:00Z',
  salesChannel: 'keeta',
  customer: { id: 'c1', name: 'Ana', phone: { number: 'ENC_#phone#' } },
  delivery: {
    deliveredBy: 'MERCHANT',
    deliveryAddress: {
      country: 'BR', state: 'SP', city: 'São Paulo', district: 'ENC_#district#',
      street: 'Rua Augusta', number: 'ENC_#number#', complement: 'ENC_#compl#',
      formattedAddress: 'ENC_#formatted#', postalCode: '01305-000',
      coordinates: { latitude: -23.55, longitude: -46.65 },
    },
  },
  items: [{
    name: 'X-Burger', quantity: 2, specialInstructions: 'sem picles',
    unitPrice: { value: 25.5, currency: 'BRL' }, totalPrice: { value: 51, currency: 'BRL' },
    options: [{ name: 'Bacon', quantity: 1, unitPrice: { value: 4, currency: 'BRL' }, totalPrice: { value: 4, currency: 'BRL' } }],
  }],
  total: { orderAmount: { value: 59.9, currency: 'BRL' } },
  payments: { prepaid: 59.9, pending: 0, methods: [{ value: 59.9, currency: 'BRL', type: 'PREPAID', method: 'PIX' }] },
}

describe('encryptedFields / isKeetaOwnDelivery', () => {
  it('collects every ENC_ value', () => {
    expect(encryptedFields(ORDER).sort())
      .toEqual(['ENC_#compl#', 'ENC_#district#', 'ENC_#formatted#', 'ENC_#number#', 'ENC_#phone#'])
  })

  it('is own delivery only for DELIVERY + MERCHANT', () => {
    expect(isKeetaOwnDelivery(ORDER)).toBe(true)
    expect(isKeetaOwnDelivery({ ...ORDER, delivery: { ...ORDER.delivery, deliveredBy: 'MARKETPLACE' } })).toBe(false)
    expect(isKeetaOwnDelivery({ ...ORDER, type: 'TAKEOUT' })).toBe(false)
  })
})

describe('normalizeKeetaOrder', () => {
  const now = new Date('2026-09-26T15:00:05Z')
  const plain = {
    'ENC_#phone#': '11999990000', 'ENC_#district#': 'Consolação', 'ENC_#number#': '100',
    'ENC_#compl#': 'ap 12', 'ENC_#formatted#': 'Rua Augusta, 100',
  }

  it('maps an own-delivery order with decrypted data', () => {
    const row = normalizeKeetaOrder(ORDER, 'store-1', plain, now)
    expect(row).toMatchObject({
      platform: 'keeta', platform_order_id: 'kt-123', platform_order_code: '0042',
      source_channel: 'KEETA',
      customer_name: 'Ana', customer_phone: '11999990000',
      address_street: 'Rua Augusta', address_number: '100', address_complement: 'ap 12',
      address_neighborhood: 'Consolação', address_city: 'São Paulo', address_zip: '01305-000',
      latitude: -23.55, longitude: -46.65,
      total_amount: 59.9, payment_method: 'pix',
      delivery_type: 'delivery', logistics_type: 'own',
      status: 'awaiting_route', route_eligibility: 'eligible',
      created_at: '2026-09-26T15:00:00Z',
    })
    expect(row.items).toEqual([{ name: 'X-Burger', quantity: 2, unit_price: 25.5, total_price: 51, notes: 'sem picles | 1x Bacon' }])
  })

  it('never stores ciphertext when it could not be decrypted', () => {
    const row = normalizeKeetaOrder({ ...ORDER, delivery: { ...ORDER.delivery, deliveredBy: 'MARKETPLACE' } }, 's', {}, now)
    expect(row).toMatchObject({
      customer_phone: null, address_number: null, address_complement: null, address_neighborhood: null,
      address_street: 'Rua Augusta', logistics_type: 'platform', status: 'normalized', route_eligibility: 'external_monitoring',
    })
    expect(JSON.stringify(row)).not.toContain('ENC_')
  })

  it('treats takeout as pickup', () => {
    const { delivery: _drop, ...takeout } = ORDER
    const row = normalizeKeetaOrder({ ...takeout, type: 'TAKEOUT' }, 's', {}, now)
    expect(row).toMatchObject({ delivery_type: 'pickup', logistics_type: 'platform', status: 'normalized', address_street: null })
  })
})
