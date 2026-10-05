// Pure 99Food rules (native "99Food Protocol" webhooks). No Supabase, no
// fetch, no Deno APIs — runs in Edge Functions and in Vitest.
// Docs: developer-food.99app.com → Food → 99Food Protocol → Webhooks / Order API.

import { createHash } from 'node:crypto'

export interface Food99Event {
  app_id?:      string
  app_shop_id?: string
  type?:        string
  timestamp?:   number
  data?:        any
}

/**
 * 99Food IDs are 64-bit integers (e.g. 5764607801871631353); JSON.parse turns
 * them into imprecise doubles. Quote every integer literal with 16+ digits
 * before parsing. Digits inside strings are preceded by a quote or a letter,
 * never by `:`, `[` or `,`, so string contents are left alone.
 */
export function parseFood99Json(raw: string): any {
  return JSON.parse(raw.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"'))
}

/** didi-header-sign = md5(raw body + app_secret), hex. */
export function verifyFood99Signature(secret: string, rawBody: string, signature: string | null): boolean {
  if (!secret || !signature) return false
  const expected = createHash('md5').update(rawBody + secret, 'utf8').digest('hex')
  const got = signature.trim().toLowerCase()
  if (expected.length !== got.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i)
  return diff === 0
}

export type Food99Action = 'new' | 'cancelled' | 'delivered' | 'ignore'

// orderCancel = cancelled by customer/99Food; orderFinish = completed.
// orderConfirm/orderReady/deliveryStatus/partial cancel don't change our status.
export function food99Action(ev: Food99Event): Food99Action {
  switch (ev.type) {
    case 'orderNew':    return 'new'
    case 'orderCancel': return 'cancelled'
    case 'orderFinish': return 'delivered'
    default:            return 'ignore'
  }
}

export function food99OrderId(ev: Food99Event): string | null {
  const id = ev.data?.order_id ?? ev.data?.order_info?.order_id
  return id == null ? null : String(id)
}

// pay_channel → our payment_method values (see Get Order Details)
const PAY_CHANNEL: Record<string, string> = {
  '150': 'credit_card', '262': 'credit_card', '263': 'debit_card',
  '153': 'cash',
  '212': 'pix', '280': 'pix',
  '257': 'meal_voucher', '258': 'meal_voucher', '259': 'meal_voucher', '260': 'meal_voucher', '264': 'meal_voucher',
}

const cents = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)) / 100
const blank = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
// 99Food sends 0 (not null) when it has no coordinate — that is not a place
const coord = (v: unknown) => (typeof v === 'number' && v !== 0 ? v : null)

/** orderNew `data.order_info` (same schema as /order/order/detail) → orders row. */
export function normalizeFood99Order(info: any, storeId: string, now = new Date()) {
  const addr     = info.receive_address ?? {}
  // fulfillment_mode 1 / delivery_type 0 = customer self pickup
  const isPickup = info.fulfillment_mode === 1 || info.delivery_type === 0
  // delivery_type 2 = the store delivers; 1 = 99Food courier
  const isOwn    = info.delivery_type === 2
  const price    = info.price ?? {}

  const items = (info.order_items ?? []).map((it: any) => ({
    name:        it.name,
    quantity:    it.amount ?? 1,
    unit_price:  cents(it.sku_price),
    total_price: cents(it.total_price),
    notes: [blank(it.remark), ...(it.sub_item_list ?? []).map((s: any) => `${s.amount ?? 1}x ${s.name}`)]
      .filter(Boolean).join(' | ') || undefined,
  }))

  const name = blank(addr.name) ?? blank([addr.first_name, addr.last_name].filter(Boolean).join(' '))
  const createdAt = typeof info.create_time === 'number' ? new Date(info.create_time * 1000) : now

  return {
    store_id:             storeId,
    platform:             '99food',
    platform_order_id:    String(info.order_id),
    // order_index is the short number the store and courier use (resets daily)
    platform_order_code:  info.order_index != null ? String(info.order_index) : null,
    customer_name:        name ?? 'Cliente 99Food',
    customer_phone:       blank(addr.virtual_phone_number) ?? blank(addr.phone),
    // Structured fields often come empty; poi_address always has the full line
    address_street:       blank(addr.street_name) ?? blank(addr.poi_address),
    address_number:       blank(addr.street_number) ?? blank(addr.house_number),
    address_complement:   blank(addr.complement),
    address_neighborhood: blank(addr.district),
    address_city:         blank(addr.city),
    address_zip:          blank(addr.postalCode),
    latitude:             coord(addr.poi_lat),
    longitude:            coord(addr.poi_lng),
    items,
    total_amount:         cents(price.real_pay_price ?? price.customer_need_paying_money ?? price.order_price),
    payment_method:       PAY_CHANNEL[String(info.pay_channel)] ?? (info.pay_method === 1 ? 'online' : null),
    delivery_type:        isPickup ? 'pickup' : 'delivery',
    logistics_type:       isOwn ? 'own' : 'platform',
    // dispatch-engine classifies it (geocoding, address and schedule rules)
    status:               'received' as string,
    route_eligibility:    null,
    rejection_count:      0,
    created_at:           createdAt.toISOString(),
    updated_at:           now.toISOString(),
  }
}

// ── Outbound requests (store-delivery actions) ──────────────────────────────

/**
 * JSON body with a 64-bit order_id written as a bare number, exactly as
 * 99Food sent it — JSON.stringify would need a JS number and lose precision.
 */
export function food99Body(fields: Record<string, unknown>, orderId: string): string {
  if (!/^\d+$/.test(orderId)) throw new Error(`invalid 99Food order_id: ${orderId}`)
  const json = JSON.stringify({ ...fields, order_id: '__ORDER_ID__' })
  return json.replace('"__ORDER_ID__"', orderId)
}

/** "Maria da Silva" → first "Maria", last "da Silva" (99Food requires both). */
export function splitCourierName(full: string | null | undefined): { name: string; first: string; last: string } {
  const name = (full ?? '').trim().replace(/\s+/g, ' ') || 'Entregador'
  const [first, ...rest] = name.split(' ')
  return { name, first, last: rest.join(' ') || first }
}

/** Brazilian phone → { code: '+55', number: digits without country code }. */
export function food99Phone(raw: string | null | undefined): { code: string; number: string } | null {
  let digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2)
  return digits.length >= 10 ? { code: '+55', number: digits } : null
}

/**
 * /order/selfdelivery/dispatch body: courier, and the pickup/delivery times
 * (unix seconds) the customer will see.
 */
export function food99DispatchBody(args: {
  authToken:   string
  orderId:     string
  courierName: string | null
  phone:       { code: string; number: string }
  now:         Date
  etaMinutes:  number | null
}): string {
  const { name, first, last } = splitCourierName(args.courierName)
  const pickup = Math.floor(args.now.getTime() / 1000)
  return food99Body({
    auth_token:   args.authToken,
    courier_info: {
      courier_name:       name,
      courier_first_name: first,
      courier_last_name:  last,
      courier_phone_code: args.phone.code,
      courier_phone:      args.phone.number,
    },
    limit_time: {
      pickup_time:   pickup,
      // no route ETA → 30 min, a typical own-delivery promise
      delivery_time: pickup + Math.max(5, args.etaMinutes ?? 30) * 60,
    },
  }, args.orderId)
}
