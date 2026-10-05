// platform-dispatch — tells the platform an own-delivery order left the store.
//
// Called by a DB trigger (pg_net, service role) when an order becomes
// 'dispatched' (operator accepted a route suggestion). Replaces the app's
// best-effort calls, which never worked (ifood-dispatch-confirm didn't exist,
// 99Food moved to its own protocol, Keeta was never called).
//
//  - iFood:  POST readyToPickup, then dispatch {deliveredBy: MERCHANT}
//  - 99Food: POST order/ready, then selfdelivery/dispatch with the courier
//            (driver from the suggestion; store phone — drivers have none) and
//            pickup/delivery times from the suggestion's ETA
//  - Keeta:  POST dispatch (DELIVERY_ONGOING)
//
// Manual and Dev orders (source_channel MANUAL / platform_order_id test-…)
// don't exist on the platform and are skipped. Each order is confirmed once
// (idempotency key); the outcome is written to order_events.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveStoreScope } from '../_shared/requireStore.ts'
import { INTEGRATION_COLUMNS, type IfoodIntegration, getValidToken } from '../_shared/ifood.ts'
import { food99Body, food99DispatchBody, food99Phone } from '../_shared/food99.ts'
import { FOOD99_INTEGRATION_COLUMNS, type Food99Integration, food99Post, getFood99Token } from '../_shared/food99Api.ts'
import {
  KEETA_API_ROOT, KEETA_INTEGRATION_COLUMNS, type KeetaIntegration, getKeetaToken, keetaFetch,
} from '../_shared/keetaApi.ts'

const IFOOD_ORDER = (id: string) => `https://merchant-api.ifood.com.br/order/v1.0/orders/${id}`

interface DispatchContext {
  orderId:      string        // platform's order id
  driverName:   string | null
  etaMinutes:   number | null
  storePhone:   string | null
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function ifoodAction(token: string, orderId: string, action: string, body?: unknown) {
  const res = await fetch(`${IFOOD_ORDER(orderId)}/${action}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body:    body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`iFood ${action} HTTP ${res.status}: ${text.slice(0, 200) || '(empty)'}`)
}

/** The "ready" step may already have been done (or not apply); never block dispatch on it. */
async function tolerate(step: string, fn: () => Promise<unknown>) {
  try { await fn() } catch (e) { console.warn('[platform-dispatch] %s ignored: %s', step, e instanceof Error ? e.message : String(e)) }
}

async function dispatchIfood(sb: SupabaseClient, storeId: string, ctx: DispatchContext) {
  const { data } = await sb.from('store_integrations').select(INTEGRATION_COLUMNS)
    .eq('store_id', storeId).eq('platform', 'ifood').eq('active', true).maybeSingle<IfoodIntegration>()
  if (!data) return 'no_integration'
  const token = await getValidToken(sb, data)
  await tolerate('iFood readyToPickup', () => ifoodAction(token, ctx.orderId, 'readyToPickup'))
  await ifoodAction(token, ctx.orderId, 'dispatch', { deliveredBy: 'MERCHANT' })
  return 'dispatched'
}

async function dispatch99(sb: SupabaseClient, storeId: string, ctx: DispatchContext) {
  const { data } = await sb.from('store_integrations').select(FOOD99_INTEGRATION_COLUMNS)
    .eq('store_id', storeId).eq('platform', '99food').eq('active', true).maybeSingle<Food99Integration>()
  if (!data) return 'no_integration'
  const phone = food99Phone(ctx.storePhone)
  if (!phone) throw new Error('99Food exige telefone do entregador: cadastre o telefone da loja em Configurações')
  const token = await getFood99Token(sb, data)
  await tolerate('99Food order/ready', () => food99Post('/order/order/ready', food99Body({ auth_token: token }, ctx.orderId)))
  await food99Post('/order/selfdelivery/dispatch', food99DispatchBody({
    authToken: token, orderId: ctx.orderId, courierName: ctx.driverName,
    phone, now: new Date(), etaMinutes: ctx.etaMinutes,
  }))
  return 'dispatched'
}

async function dispatchKeeta(sb: SupabaseClient, storeId: string, ctx: DispatchContext) {
  const { data } = await sb.from('store_integrations').select(KEETA_INTEGRATION_COLUMNS)
    .eq('store_id', storeId).eq('platform', 'keeta').eq('active', true).maybeSingle<KeetaIntegration>()
  if (!data) return 'no_integration'
  const token = await getKeetaToken(sb, data, KEETA_API_ROOT)
  await keetaFetch(data, token, `${KEETA_API_ROOT}/v1/orders/${encodeURIComponent(ctx.orderId)}/dispatch`, {
    deliveryTrackingInfo: { event: { type: 'DELIVERY_ONGOING', datetime: new Date().toISOString() } },
  })
  return 'dispatched'
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* handled below */ }
  const orderUuid = typeof body.order_id === 'string' ? body.order_id : ''
  const bodyStoreId = typeof body.store_id === 'string' ? body.store_id : undefined
  if (!orderUuid) return json({ ok: false, error: 'order_id is required' }, 400)

  const auth = await resolveStoreScope(req, bodyStoreId)
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status)

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: order } = await sb.from('orders')
    .select('id, store_id, platform, platform_order_id, platform_order_code, status, logistics_type, source_channel')
    .eq('id', orderUuid).eq('store_id', auth.storeId).maybeSingle()
  if (!order) return json({ ok: false, error: 'order not found' }, 404)

  const skip = (reason: string) => json({ ok: true, skipped: reason })
  if (order.status !== 'dispatched') return skip('not_dispatched')
  if (order.logistics_type !== 'own') return skip('platform_logistics')
  if (order.source_channel === 'MANUAL' || String(order.platform_order_id).startsWith('test-')) return skip('not_a_platform_order')

  const doneKey = `platform-dispatch:${order.id}`
  const { data: done } = await sb.from('idempotency_keys').select('key').eq('key', doneKey).maybeSingle()
  if (done) return skip('already_confirmed')

  // Driver and ETA from the suggestion the operator accepted
  const { data: suggestion } = await sb.from('dispatch_suggestions')
    .select('assigned_driver_id, predicted_eta')
    .eq('store_id', order.store_id).eq('status', 'dispatched')
    .contains('suggested_sequence', [order.id])
    .order('reviewed_at', { ascending: false }).limit(1).maybeSingle()
  const { data: driver } = suggestion?.assigned_driver_id
    ? await sb.from('drivers').select('name').eq('id', suggestion.assigned_driver_id).maybeSingle()
    : { data: null }
  const { data: store } = await sb.from('stores').select('phone').eq('id', order.store_id).maybeSingle()

  const ctx: DispatchContext = {
    orderId:    String(order.platform_order_id),
    driverName: driver?.name ?? null,
    etaMinutes: suggestion?.predicted_eta ?? null,
    storePhone: store?.phone ?? null,
  }

  try {
    const result =
      order.platform === 'ifood'  ? await dispatchIfood(sb, order.store_id, ctx) :
      order.platform === '99food' ? await dispatch99(sb, order.store_id, ctx) :
      order.platform === 'keeta'  ? await dispatchKeeta(sb, order.store_id, ctx) :
      'unknown_platform'

    if (result === 'dispatched') {
      await sb.from('idempotency_keys').upsert({
        key: doneKey, store_id: order.store_id, fn_name: 'platform-dispatch', result: { platform: order.platform },
      })
      await sb.from('order_events').insert({
        order_id: order.id, store_id: order.store_id, event_type: 'platform_dispatched', actor_type: 'system',
        previous: null, next: { platform: order.platform }, metadata: { driver: ctx.driverName, eta_min: ctx.etaMinutes },
      })
    }
    console.log('[platform-dispatch] order=%s platform=%s result=%s', order.platform_order_code ?? order.id, order.platform, result)
    return json({ ok: true, result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[platform-dispatch] order=%s platform=%s failed: %s', order.platform_order_code ?? order.id, order.platform, msg)
    await sb.from('order_events').insert({
      order_id: order.id, store_id: order.store_id, event_type: 'platform_dispatch_failed', actor_type: 'system',
      previous: null, next: null, metadata: { platform: order.platform, error: msg },
    })
    await sb.from('store_integrations').update({ last_error: `despacho ${order.platform_order_code ?? ''}: ${msg}` })
      .eq('store_id', order.store_id).eq('platform', order.platform)
    return json({ ok: false, error: msg }, 500)
  }
})
