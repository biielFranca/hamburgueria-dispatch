import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE        = 'https://merchant-api.ifood.com.br'
const AUTH_URL    = `${BASE}/authentication/v1.0/oauth/token`
const EVENTS_URL  = `${BASE}/order/v1.0/events:polling`
const ORDER_URL   = (id: string) => `${BASE}/order/v1.0/orders/${id}`
const ACK_URL     = `${BASE}/order/v1.0/events/acknowledgment`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function reply(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
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
  if (!res.ok) return []
  const text = await res.text()
  if (!text.trim()) return []   // iFood: empty body = no new events
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

  const { storeId, testMode, clientId: tId, clientSecret: tSecret } = parsed

  // ── Test mode ──────────────────────────────────────────────────
  if (testMode) {
    if (!tId || !tSecret) {
      return reply({ ok: false, error: 'clientId e clientSecret são obrigatórios' })
    }
    try {
      const { token } = await getToken(tId, tSecret)
      const events   = await getEvents(token)
      return reply({ ok: true, events: events.length })
    } catch (e) {
      return reply({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // ── Sync mode ──────────────────────────────────────────────────
  if (!storeId) {
    return reply({ ok: false, error: 'storeId é obrigatório', inserted: 0, events: 0, errors: [] })
  }

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

    const events  = await getEvents(token)
    const placed  = events.filter((e: any) => e.code === 'PLACED')
    let inserted  = 0
    const errors: string[] = []

    for (const ev of placed) {
      try {
        const { data: existing } = await sb.from('orders')
          .select('id').eq('platform_order_id', ev.orderId).maybeSingle()
        if (existing) continue
        const ifoodOrder = await getOrder(token, ev.orderId)
        const { error: ie } = await sb.from('orders').insert(normalize(ifoodOrder, storeId))
        if (ie) errors.push(`${ev.orderId}: ${ie.message}`)
        else inserted++
      } catch (e) {
        errors.push(`${ev.orderId}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    await ackEvents(token, events.map((e: any) => e.id))
    await sb.from('store_integrations').update({
      last_sync_at: new Date().toISOString(),
      last_error:   errors.length ? errors.join('; ') : null,
    }).eq('id', integration.id)

    return reply({ ok: true, inserted, events: events.length, errors })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('ifood-sync fatal:', msg)
    return reply({ ok: false, error: msg, inserted: 0, events: 0, errors: [] })
  }
})
