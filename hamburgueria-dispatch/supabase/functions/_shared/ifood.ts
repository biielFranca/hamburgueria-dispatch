// iFood Merchant API access + applying order events to our DB.
// Shared by ifood-webhook (real-time path) and ifood-sync (manual
// reconciliation via events:polling). Pure rules live in ./ifoodEvents.ts.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { type IfoodEvent, isPlaced, terminalStatus } from './ifoodEvents.ts'

const BASE       = 'https://merchant-api.ifood.com.br'
const AUTH_URL   = `${BASE}/authentication/v1.0/oauth/token`
const EVENTS_URL = `${BASE}/order/v1.0/events:polling`
const ORDER_URL  = (id: string) => `${BASE}/order/v1.0/orders/${id}`
const ACK_URL    = `${BASE}/order/v1.0/events/acknowledgment`

export interface IfoodIntegration {
  id:               string
  store_id:         string
  client_id:        string | null
  client_secret:    string | null
  access_token:     string | null
  token_expires_at: string | null
  merchant_id:      string | null
}

export const INTEGRATION_COLUMNS =
  'id, store_id, client_id, client_secret, access_token, token_expires_at, merchant_id'

async function requestToken(clientId: string, clientSecret: string) {
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      clientId,
      clientSecret,
      grantType: 'client_credentials',
    }).toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`iFood auth failed (${res.status}): ${text || '(empty)'}`)
  if (!text.trim()) throw new Error('iFood auth returned empty body')
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`iFood auth returned non-JSON: ${text.slice(0, 200)}`)
  }
  return {
    token:     data.accessToken as string,
    expiresAt: new Date(Date.now() + ((data.expiresIn ?? 21600) - 300) * 1000),
  }
}

/** Cached token from the row, or a fresh one (persisted for the next call). */
export async function getValidToken(sb: SupabaseClient, integration: IfoodIntegration): Promise<string> {
  if (integration.access_token && integration.token_expires_at && new Date(integration.token_expires_at) > new Date()) {
    return integration.access_token
  }
  const result = await requestToken(integration.client_id ?? '', integration.client_secret ?? '')
  await sb.from('store_integrations')
    .update({ access_token: result.token, token_expires_at: result.expiresAt.toISOString() })
    .eq('id', integration.id)
  integration.access_token     = result.token
  integration.token_expires_at = result.expiresAt.toISOString()
  return result.token
}

export async function pollEvents(token: string): Promise<IfoodEvent[]> {
  const res = await fetch(EVENTS_URL, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  // 204/empty body = no new events. Any other non-2xx is a real failure
  // (e.g. merchant not linked to this app) and must surface in last_error
  // instead of looking like "no orders".
  if (!res.ok) throw new Error(`iFood events polling failed (${res.status}): ${text.slice(0, 300) || '(empty)'}`)
  if (!text.trim()) return []
  try {
    const data = JSON.parse(text)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export async function ackEvents(token: string, ids: string[]) {
  if (!ids.length) return
  await fetch(ACK_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(ids.map(id => ({ id }))),
  })
}

async function getOrder(token: string, orderId: string) {
  const res = await fetch(ORDER_URL(orderId), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`getOrder ${orderId} failed (${res.status})`)
  return res.json()
}

const PAY: Record<string, string> = {
  CREDIT: 'credit_card', DEBIT: 'debit_card', CASH: 'cash',
  PIX: 'pix', ONLINE: 'online', MEAL_VOUCHER: 'meal_voucher', FOOD_VOUCHER: 'meal_voucher',
}

function normalize(order: any, storeId: string) {
  const addr      = order.delivery?.deliveryAddress
  const isTakeout = order.orderType === 'TAKEOUT' || !addr
  const isOwn     = order.deliveryMethod?.deliveredBy === 'MERCHANT'
  const items     = (order.items ?? []).map((it: any) => ({
    name:        it.name,
    quantity:    it.quantity ?? 1,
    unit_price:  it.unitPrice ?? it.price ?? 0,
    total_price: it.totalPrice ?? 0,
    notes: [it.observations, ...(it.subItems ?? []).map((s: any) => `${s.quantity}x ${s.name}`)]
      .filter(Boolean).join(' | ') || undefined,
  }))
  const rawPay = order.payments?.methods?.[0]?.method ?? ''
  return {
    store_id:             storeId,
    platform:             'ifood',
    platform_order_id:    order.id,
    platform_order_code:  order.displayId ?? order.code ?? null,
    customer_name:        order.customer?.name ?? 'Cliente iFood',
    customer_phone:       order.customer?.phone?.number ?? null,
    address_street:       addr?.streetName ?? null,
    address_number:       addr?.streetNumber ?? null,
    address_complement:   addr?.complement ?? null,
    address_neighborhood: addr?.neighborhood ?? null,
    address_city:         addr?.city?.name ?? null,
    address_zip:          addr?.postalCode ?? null,
    latitude:             addr?.coordinates?.latitude ?? null,
    longitude:            addr?.coordinates?.longitude ?? null,
    items,
    total_amount:         order.totalPrice ?? 0,
    payment_method:       PAY[rawPay] ?? rawPay.toLowerCase() ?? null,
    delivery_type:        isTakeout ? 'pickup' : 'delivery',
    logistics_type:       isOwn ? 'own' : 'platform',
    status:               (!isTakeout && isOwn) ? 'awaiting_route' : 'normalized',
    route_eligibility:    (!isTakeout && isOwn) ? 'eligible' : 'external_monitoring',
    rejection_count:      0,
    created_at:           order.createdAt ?? new Date().toISOString(),
    updated_at:           new Date().toISOString(),
  }
}

// Events can arrive out of order (webhook) or a PLACED can fail and be retried
// after its CANCELLED was applied. The end status is parked here so the order
// is born closed instead of ringing as new. Purged after 24 h by pg_cron.
const parkedKey = (orderId: string) => `ifood-terminal:${orderId}`

export type ApplyResult = 'inserted' | 'duplicate' | 'closed' | 'parked' | 'ignored'

/** Applies one order event. Throws on failure so the caller can retry/not-ack it. */
export async function applyEvent(
  sb: SupabaseClient,
  integration: IfoodIntegration,
  ev: IfoodEvent,
): Promise<ApplyResult> {
  if (!ev.orderId) return 'ignored'
  const storeId = integration.store_id

  if (isPlaced(ev)) {
    const { data: existing } = await sb.from('orders')
      .select('id')
      .eq('store_id', storeId).eq('platform', 'ifood').eq('platform_order_id', ev.orderId)
      .maybeSingle()
    if (existing) return 'duplicate'

    const token = await getValidToken(sb, integration)
    const row   = normalize(await getOrder(token, ev.orderId), storeId)

    const { data: parked } = await sb.from('idempotency_keys')
      .select('result').eq('key', parkedKey(ev.orderId)).maybeSingle()
    if (parked?.result?.status) row.status = parked.result.status

    const { error } = await sb.from('orders').insert(row)
    // 23505 = the same PLACED processed concurrently (webhook retry) — fine
    if (error?.code === '23505') return 'duplicate'
    if (error) throw new Error(`insert ${ev.orderId}: ${error.message}`)
    return 'inserted'
  }

  const status = terminalStatus(ev)
  if (!status) return 'ignored'

  const { data, error } = await sb.from('orders')
    .update({ status })
    .eq('store_id', storeId)
    .eq('platform', 'ifood')
    .eq('platform_order_id', ev.orderId)
    .not('status', 'in', '("delivered","cancelled")')
    .select('id')
  if (error) throw new Error(`close ${ev.orderId}: ${error.message}`)
  if (data?.length) return 'closed'

  // Not stored (yet): either PLACED is still coming, or it was placed before
  // the integration existed. Park it; harmless if PLACED never arrives.
  const { error: pe } = await sb.from('idempotency_keys').upsert({
    key:      parkedKey(ev.orderId),
    store_id: storeId,
    fn_name:  'ifood-events',
    result:   { status },
  })
  if (pe) throw new Error(`park ${ev.orderId}: ${pe.message}`)
  return 'parked'
}

/** Remembers which iFood merchant this integration is, from the first event seen. */
export async function learnMerchantId(sb: SupabaseClient, integration: IfoodIntegration, merchantId?: string) {
  if (!merchantId || integration.merchant_id) return
  const { error } = await sb.from('store_integrations')
    .update({ merchant_id: merchantId })
    .eq('id', integration.id)
    .is('merchant_id', null)
  if (!error) integration.merchant_id = merchantId
}
