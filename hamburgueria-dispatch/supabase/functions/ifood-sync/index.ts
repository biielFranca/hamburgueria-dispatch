import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveStoreScope } from '../_shared/requireStore.ts'

const BASE        = 'https://merchant-api.ifood.com.br'
const AUTH_URL    = `${BASE}/authentication/v1.0/oauth/token`
const EVENTS_URL  = `${BASE}/order/v1.0/events:polling`
const ORDER_URL   = (id: string) => `${BASE}/order/v1.0/orders/${id}`
const ACK_URL     = `${BASE}/order/v1.0/events/acknowledgment`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

async function getToken(clientId: string, clientSecret: string) {
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

async function getEvents(token: string): Promise<any[]> {
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

async function getOrder(token: string, orderId: string) {
  const res = await fetch(ORDER_URL(orderId), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`getOrder ${orderId} failed (${res.status})`)
  return res.json()
}

async function ackEvents(token: string, ids: string[]) {
  if (!ids.length) return
  await fetch(ACK_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(ids.map(id => ({ id }))),
  })
}

// Events that end an order on iFood → our terminal status. Without this a
// cancelled or concluded order stayed open in our DB forever.
function terminalStatus(ev: any): 'cancelled' | 'delivered' | null {
  if (ev.code === 'CAN' || ev.fullCode === 'CANCELLED') return 'cancelled'
  if (ev.code === 'CON' || ev.fullCode === 'CONCLUDED') return 'delivered'
  return null
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS })
  }

  let parsed: Record<string, any> = {}
  try {
    parsed = await req.json()
  } catch {
    // body not JSON — ignore
  }

  // Security: storeId comes from the caller's JWT (users.store_id). Only a
  // service-role caller (cron) may pass storeId in the body. Anything else
  // is rejected before touching iFood or the database.
  const bodyStoreId = typeof parsed.storeId === 'string' ? parsed.storeId.trim() : undefined
  const auth = await resolveStoreScope(req, bodyStoreId)
  if (!auth.ok) {
    return reply({ ok: false, error: auth.error, inserted: 0, events: 0, errors: [] }, auth.status)
  }
  const storeId = auth.storeId

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: integration } = await sb
      .from('store_integrations').select('*')
      .eq('store_id', storeId).eq('platform', 'ifood').eq('active', true).maybeSingle()

    if (!integration) {
      return reply({ ok: true, skipped: true, inserted: 0, events: 0, errors: [] })
    }

    let token: string
    const now = new Date()
    if (integration.access_token && integration.token_expires_at && new Date(integration.token_expires_at) > now) {
      token = integration.access_token
    } else {
      try {
        const result = await getToken(integration.client_id, integration.client_secret)
        token = result.token
        await sb.from('store_integrations')
          .update({ access_token: token, token_expires_at: result.expiresAt.toISOString() })
          .eq('id', integration.id)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await sb.from('store_integrations').update({ last_error: msg }).eq('id', integration.id)
        return reply({ ok: false, error: msg, inserted: 0, events: 0, errors: [msg] })
      }
    }

    let events: any[]
    try {
      events = await getEvents(token)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await sb.from('store_integrations').update({ last_error: msg }).eq('id', integration.id)
      return reply({ ok: false, error: msg, inserted: 0, events: 0, errors: [msg] })
    }
    if (events.length) {
      // Codes only (no customer data) — lets us see which event types arrive.
      console.log('[ifood-sync] store=%s events=%s', storeId, events.map((e: any) => e.code ?? e.fullCode).join(','))
    }
    // iFood sends the short code (PLC) in `code` and the long one in `fullCode`.
    const placed  = events.filter((e: any) => e.code === 'PLC' || e.fullCode === 'PLACED')
    let inserted  = 0
    const errors: string[] = []
    // iFood never redelivers an acknowledged event, so a PLACED event whose
    // order failed to persist must stay un-acked and come back next poll.
    const failedEventIds = new Set<string>()

    for (const ev of placed) {
      try {
        const { data: existing } = await sb.from('orders')
          .select('id').eq('platform_order_id', ev.orderId).maybeSingle()
        if (existing) continue
        const ifoodOrder = await getOrder(token, ev.orderId)
        const { error: ie } = await sb.from('orders').insert(normalize(ifoodOrder, storeId))
        if (ie) {
          errors.push(`${ev.orderId}: ${ie.message}`)
          failedEventIds.add(ev.id)
        } else inserted++
      } catch (e) {
        errors.push(`${ev.orderId}: ${e instanceof Error ? e.message : String(e)}`)
        failedEventIds.add(ev.id)
      }
    }

    // After PLACED, so a PLACED + CAN in the same batch ends up cancelled.
    // Orders we never stored (placed before the integration) match 0 rows — fine.
    let closed = 0
    for (const ev of events) {
      const status = terminalStatus(ev)
      if (!status) continue
      const { data, error: ue } = await sb.from('orders')
        .update({ status })
        .eq('store_id', storeId)
        .eq('platform', 'ifood')
        .eq('platform_order_id', ev.orderId)
        .not('status', 'in', '("delivered","cancelled")')
        .select('id')
      if (ue) {
        errors.push(`${ev.orderId}: ${ue.message}`)
        failedEventIds.add(ev.id)
      } else closed += data?.length ?? 0
    }

    await ackEvents(token, events.filter((e: any) => !failedEventIds.has(e.id)).map((e: any) => e.id))
    await sb.from('store_integrations').update({
      last_sync_at: new Date().toISOString(),
      last_error:   errors.length ? errors.join('; ') : null,
    }).eq('id', integration.id)

    return reply({ ok: true, inserted, closed, events: events.length, errors })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('ifood-sync fatal:', msg)
    return reply({ ok: false, error: msg, inserted: 0, events: 0, errors: [] })
  }
})
