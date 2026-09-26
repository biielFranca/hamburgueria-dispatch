// 99Food → us, in real time (native "99Food Protocol"). The URL is set as the
// app's "Endereço do webhook" in 99Food's Application Management. 99Food's
// Open Delivery layer is polling-only, so it is not used (Decision 015).
//
// Contract (developer-food.99app.com, 99Food Protocol → Webhooks):
//  - one event per POST; didi-header-sign = md5(raw body + app_secret)
//  - IDs are 64-bit integers → parsed with parseFood99Json, never JSON.parse
//  - answer {"errno":0} within 6 s; anything else → 99Food resends
//  - orderNew carries the full order, so no 99Food API call (or auth_token)
//    is needed to receive it. The store still confirms orders in the 99Food
//    store app (confirmation method "B-App & OpenAPI", the default).
//
// Credentials live in store_integrations (platform '99food'):
// client_id = app_id, client_secret = app_secret.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type Food99Event, food99Action, food99OrderId, normalizeFood99Order, parseFood99Json, verifyFood99Signature,
} from '../_shared/food99.ts'

interface Food99Integration {
  id:            string
  store_id:      string
  client_secret: string | null
  merchant_id:   string | null
}

const json = (status: number, errno: number, errmsg: string) =>
  new Response(JSON.stringify({ errno, errmsg }), { status, headers: { 'Content-Type': 'application/json' } })

// Same idea as the iFood side: an end event that arrives before its orderNew
// is parked so the order is born closed instead of ringing as new.
const parkedKey = (orderId: string) => `food99-terminal:${orderId}`

async function applyEvent(sb: SupabaseClient, integration: Food99Integration, ev: Food99Event): Promise<string> {
  const action  = food99Action(ev)
  const orderId = food99OrderId(ev)
  if (action === 'ignore' || !orderId) return 'ignored'
  const storeId = integration.store_id

  if (action === 'new') {
    const info = ev.data?.order_info
    if (!info) throw new Error(`orderNew ${orderId} without order_info`)

    const { data: existing } = await sb.from('orders')
      .select('id')
      .eq('store_id', storeId).eq('platform', '99food').eq('platform_order_id', orderId)
      .maybeSingle()
    if (existing) return 'duplicate'

    const row = normalizeFood99Order(info, storeId)
    const { data: parked } = await sb.from('idempotency_keys')
      .select('result').eq('key', parkedKey(orderId)).maybeSingle()
    if (parked?.result?.status) row.status = parked.result.status

    const { error } = await sb.from('orders').insert(row)
    if (error?.code === '23505') return 'duplicate'
    if (error) throw new Error(`insert ${orderId}: ${error.message}`)
    return 'inserted'
  }

  const { data, error } = await sb.from('orders')
    .update({ status: action })
    .eq('store_id', storeId)
    .eq('platform', '99food')
    .eq('platform_order_id', orderId)
    .not('status', 'in', '("delivered","cancelled")')
    .select('id')
  if (error) throw new Error(`close ${orderId}: ${error.message}`)
  if (data?.length) return 'closed'

  const { error: pe } = await sb.from('idempotency_keys').upsert({
    key:      parkedKey(orderId),
    store_id: storeId,
    fn_name:  'food99-events',
    result:   { status: action },
  })
  if (pe) throw new Error(`park ${orderId}: ${pe.message}`)
  return 'parked'
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, 1, 'method not allowed')

  // Raw text first: the signature covers the body exactly as sent
  const raw = await req.text()
  const signature = req.headers.get('didi-header-sign')

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: rows, error: le } = await sb
    .from('store_integrations').select('id, store_id, client_secret, merchant_id')
    .eq('platform', '99food').eq('active', true)
  if (le) return json(500, 1, 'integrations lookup failed')
  const integrations = (rows ?? []) as Food99Integration[]

  // One app → every store shares its app_secret; normally a single MD5
  const secrets = [...new Set(integrations.map(i => i.client_secret).filter((s): s is string => !!s))]
  if (!secrets.some(secret => verifyFood99Signature(secret, raw, signature))) {
    return json(401, 1, 'invalid signature')
  }

  let ev: Food99Event
  try {
    ev = parseFood99Json(raw)
  } catch {
    return json(400, 1, 'invalid json')
  }

  // app_shop_id is the id WE give the store when binding it to the app;
  // shop_id is 99Food's own id for it.
  const shopKeys = [ev.app_shop_id, ev.data?.order_info?.shop?.shop_id].filter(Boolean).map(String)
  let integration = integrations.find(i =>
    shopKeys.includes(i.store_id) || (i.merchant_id != null && shopKeys.includes(i.merchant_id)))
  if (!integration && integrations.length === 1 && !integrations[0].merchant_id && ev.app_shop_id) {
    // Bootstrap: a single unlinked store learns its app_shop_id from the first event
    integration = integrations[0]
    const { error } = await sb.from('store_integrations')
      .update({ merchant_id: String(ev.app_shop_id) })
      .eq('id', integration.id).is('merchant_id', null)
    if (!error) integration.merchant_id = String(ev.app_shop_id)
  }
  if (!integration) {
    console.warn('[food99-webhook] no store for app_shop_id=%s type=%s', ev.app_shop_id, ev.type)
    return json(200, 0, 'ok')
  }

  try {
    const result = await applyEvent(sb, integration, ev)
    console.log('[food99-webhook] store=%s type=%s result=%s', integration.store_id, ev.type, result)
    await sb.from('store_integrations')
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id)
    return json(200, 0, 'ok')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[food99-webhook] store=%s type=%s failed: %s', integration.store_id, ev.type, msg)
    await sb.from('store_integrations').update({ last_error: msg }).eq('id', integration.id)
    // errno != 0 → 99Food resends
    return json(500, 1, 'processing failed')
  }
})
