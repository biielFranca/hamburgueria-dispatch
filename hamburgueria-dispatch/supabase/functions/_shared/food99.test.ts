import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  parseFood99Json, verifyFood99Signature, food99Action, food99OrderId, normalizeFood99Order,
} from './food99'

// Trimmed from the orderNew example in the 99Food docs (Order Webhooks)
const ORDER_NEW = `{
  "app_id": 5764607584567296012,
  "app_shop_id": "7093",
  "timestamp": 1615432308,
  "type": "orderNew",
  "data": {
    "order_id": 1152921547153933576,
    "order_info": {
      "order_id": 1152921547153933576,
      "status": 100,
      "order_index": 2,
      "remark": "",
      "pay_type": 1,
      "pay_method": 1,
      "pay_channel": 150,
      "delivery_type": 2,
      "fulfillment_mode": 0,
      "create_time": 1602832474,
      "price": { "order_price": 2000, "real_price": 2500, "real_pay_price": 2500, "delivery_price": 500 },
      "shop": { "shop_id": 5764607688097661019, "app_shop_id": "7093", "shop_name": "Loja 5764607688097661019" },
      "receive_address": {
        "uid": 299070223744111,
        "name": "",
        "first_name": "Ana",
        "last_name": "Souza",
        "phone": "00016004812",
        "virtual_phone_number": "06234421637",
        "city": "Belo Horizonte",
        "poi_address": "R. Congonhas, 405 - Santo Antônio, Belo Horizonte - MG, 30330-100, Brasil",
        "street_name": "",
        "street_number": "",
        "district": "",
        "postalCode": "",
        "complement": "",
        "poi_lat": -19.9440597,
        "poi_lng": -43.9392454
      },
      "order_items": [
        {
          "name": "King Jr. Hamburguesa de Queso",
          "total_price": 15000,
          "sku_price": 7500,
          "amount": 2,
          "remark": "sem cebola",
          "sub_item_list": [
            { "name": "Papas Chicas", "amount": 1, "sub_item_list": [] },
            { "name": "Pepsi Black", "amount": 1, "sub_item_list": [] }
          ]
        }
      ]
    }
  }
}`

const SECRET = 'app-secret'
const md5 = (s: string) => createHash('md5').update(s).digest('hex')

describe('parseFood99Json', () => {
  it('keeps 64-bit ids exact (JSON.parse would round them)', () => {
    expect(String(JSON.parse(ORDER_NEW).data.order_id)).not.toBe('1152921547153933576')
    const ev = parseFood99Json(ORDER_NEW)
    expect(ev.data.order_id).toBe('1152921547153933576')
    expect(ev.app_id).toBe('5764607584567296012')
    expect(ev.data.order_info.shop.shop_id).toBe('5764607688097661019')
  })

  it('leaves small numbers and digits inside strings alone', () => {
    const ev = parseFood99Json(ORDER_NEW)
    expect(ev.timestamp).toBe(1615432308)
    expect(ev.data.order_info.receive_address.uid).toBe(299070223744111)
    expect(ev.data.order_info.shop.shop_name).toBe('Loja 5764607688097661019')
    expect(ev.data.order_info.price.order_price).toBe(2000)
  })

  it('handles ids inside arrays', () => {
    expect(parseFood99Json('{"ids":[5764607801871631353,5764607801871631354]}').ids)
      .toEqual(['5764607801871631353', '5764607801871631354'])
  })
})

describe('verifyFood99Signature', () => {
  it('accepts md5(raw body + app_secret)', () => {
    expect(verifyFood99Signature(SECRET, ORDER_NEW, md5(ORDER_NEW + SECRET))).toBe(true)
  })

  it('rejects another secret, a changed body, or no signature', () => {
    expect(verifyFood99Signature(SECRET, ORDER_NEW, md5(ORDER_NEW + 'other'))).toBe(false)
    expect(verifyFood99Signature(SECRET, ORDER_NEW + ' ', md5(ORDER_NEW + SECRET))).toBe(false)
    expect(verifyFood99Signature(SECRET, ORDER_NEW, null)).toBe(false)
    expect(verifyFood99Signature('', ORDER_NEW, md5(ORDER_NEW))).toBe(false)
  })
})

describe('food99Action / food99OrderId', () => {
  it('maps the order lifecycle callbacks', () => {
    expect(food99Action({ type: 'orderNew' })).toBe('new')
    expect(food99Action({ type: 'orderCancel' })).toBe('cancelled')
    expect(food99Action({ type: 'orderFinish' })).toBe('delivered')
    expect(food99Action({ type: 'orderConfirm' })).toBe('ignore')
    expect(food99Action({ type: 'orderPartialCancel' })).toBe('ignore')
    expect(food99Action({ type: 'deliveryStatus' })).toBe('ignore')
  })

  it('reads the order id as a string', () => {
    expect(food99OrderId(parseFood99Json('{"type":"orderCancel","data":{"order_id":5764607801871630353}}')))
      .toBe('5764607801871630353')
    expect(food99OrderId({ type: 'orderCancel', data: {} })).toBeNull()
  })
})

describe('normalizeFood99Order', () => {
  const now = new Date('2026-09-26T12:00:00Z')
  const info = () => parseFood99Json(ORDER_NEW).data.order_info

  it('maps a store-delivered order', () => {
    const row = normalizeFood99Order(info(), 'store-1', now)
    expect(row).toMatchObject({
      store_id:            'store-1',
      platform:            '99food',
      platform_order_id:   '1152921547153933576',
      platform_order_code: '2',
      customer_name:       'Ana Souza',
      customer_phone:      '06234421637',
      address_street:      'R. Congonhas, 405 - Santo Antônio, Belo Horizonte - MG, 30330-100, Brasil',
      address_city:        'Belo Horizonte',
      latitude:            -19.9440597,
      longitude:           -43.9392454,
      total_amount:        25,
      payment_method:      'credit_card',
      delivery_type:       'delivery',
      logistics_type:      'own',
      status:              'awaiting_route',
      route_eligibility:   'eligible',
      created_at:          '2020-10-16T07:14:34.000Z',
      updated_at:          now.toISOString(),
    })
    expect(row.items).toEqual([{
      name: 'King Jr. Hamburguesa de Queso', quantity: 2, unit_price: 75, total_price: 150,
      notes: 'sem cebola | 1x Papas Chicas | 1x Pepsi Black',
    }])
  })

  it('treats 99Food courier delivery as platform logistics', () => {
    const row = normalizeFood99Order({ ...info(), delivery_type: 1 }, 's', now)
    expect(row).toMatchObject({ logistics_type: 'platform', status: 'normalized', route_eligibility: 'external_monitoring' })
  })

  it('treats self pickup as pickup, whatever the delivery type', () => {
    for (const patch of [{ fulfillment_mode: 1 }, { delivery_type: 0 }]) {
      const row = normalizeFood99Order({ ...info(), ...patch }, 's', now)
      expect(row).toMatchObject({ delivery_type: 'pickup', status: 'normalized', route_eligibility: 'external_monitoring' })
    }
  })

  it('maps payment channels and falls back to online', () => {
    expect(normalizeFood99Order({ ...info(), pay_channel: 280 }, 's', now).payment_method).toBe('pix')
    expect(normalizeFood99Order({ ...info(), pay_channel: 153 }, 's', now).payment_method).toBe('cash')
    expect(normalizeFood99Order({ ...info(), pay_channel: 190, pay_method: 1 }, 's', now).payment_method).toBe('online')
  })

  it('falls back on missing customer name', () => {
    const i = info()
    i.receive_address = { ...i.receive_address, first_name: '', last_name: '' }
    expect(normalizeFood99Order(i, 's', now).customer_name).toBe('Cliente 99Food')
  })
})
