// Keeta → us, in real time (Keeta's Open Delivery webhook). Keeta posts to
// {registered base URL}/v1/newEvent, so the base registered in Keeta's portal
// is https://<project>.supabase.co/functions/v1/keeta-webhook.
//
// Contract (api-docs.mykeeta.com/apis/opendelivery):
//  - headers X-App-Id, X-App-MerchantId, X-App-Signature
//  - X-App-Signature = base64(HMAC-SHA256(client_secret, url&params&body)),
//    body canonicalized per RFC 8785 — see verifyKeetaSignature
//  - the event only has ids + orderURL; the order is fetched from Keeta with
//    an app-level token, and requests to Keeta are signed the same way
//  - personal data comes as ENC_ ciphertext; Keeta decrypts it only for
//    orders the store delivers itself
//  - answer 204; anything else → Keeta resends
//
// Credentials live in store_integrations (platform 'keeta'): client_id,
// client_secret; merchant_id = X-App-MerchantId (learned on the first event).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type KeetaEvent, canonicalJson, encryptedFields, isKeetaOwnDelivery, keetaAction, keetaSign,
  keetaSignatureString, normalizeKeetaOrder, verifyKeetaSignature,
} from '../_shared/keeta.ts'

interface KeetaIntegration {
  id:               string
  store_id:         string
  client_id:        string | null
  client_secret:    string | null
  access_token:     string | null
  token_expires_at: string | null
  merchant_id:      string | null
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const FN_NAME      = 'keeta-webhook'

const problem = (status: number, title: string) =>
  new Response(JSON.stringify({ title, status }), { status, headers: { 'Content-Type': 'application/problem+json' } })

const parkedKey = (orderId: string) => `keeta-terminal:${orderId}`

// orderURL looks like https://<keeta host>/<prefix>/v1/orders/<id>; the API
// root (token, batchDecrypt) is everything before /v1/orders.
function apiRoot(orderUrl: string): string {
  const u = new URL(orderUrl)
  if (u.protocol !== 'https:') throw new Error('orderURL must be https')
  const i = u.pathname.indexOf('/v1/orders')
  return `${u.origin}${i >= 0 ? u.pathname.slice(0, i) : ''}`
}

async function getToken(sb: SupabaseClient, integration: KeetaIntegration, root: string): Promise<string> {
  if (integration.access_token && integration.token_expires_at && new Date(integration.token_expires_at) > new Date()) {
    return integration.access_token
  }
  const res = await fetch(`${root}/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      client_id:     integration.client_id,
      client_secret: integration.client_secret,
      grant_type:    'app_level_token',
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Keeta auth failed (${res.status}): ${text.slice(0, 200) || '(empty)'}`)
  const data = JSON.parse(text)
  if (!data.access_token) throw new Error('Keeta auth returned no access_token')
  const expiresAt = new Date(Date.now() + Math.max(60, (data.expires_in ?? 3600) - 300) * 1000).toISOString()
  await sb.from('store_integrations')
    .update({ access_token: data.access_token, token_expires_at: expiresAt })
    .eq('id', integration.id)
  integration.access_token     = data.access_token
  integration.token_expires_at = expiresAt
  return data.access_token
}

/** Signed request to Keeta (same signature scheme it uses on webhooks). */
async function keetaFetch(integration: KeetaIntegration, token: string, url: string, body?: unknown) {
  const u = new URL(url)
  const params = Object.fromEntries(u.searchParams)
  const payload = body === undefined ? '' : canonicalJson(body)
  const signature = await keetaSign(integration.client_secret!, keetaSignatureString(`${u.origin}${u.pathname}`, params, payload))
  const headers: Record<string, string> = {
    Authorization:     `Bearer ${token}`,
    'X-App-Signature': signature,
  }
  if (integration.merchant_id) headers['X-App-MerchantId'] = integration.merchant_id
  if (payload) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, { method: payload ? 'POST' : 'GET', headers, body: payload || undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(`${u.pathname} failed (${res.status}): ${text.slice(0, 200) || '(empty)'}`)
  return JSON.parse(text)
}

async function decryptAll(integration: KeetaIntegration, token: string, root: string, ciphers: string[]) {
  const plain: Record<string, string> = {}
  if (!ciphers.length) return plain
  const res = await keetaFetch(integration, token, `${root}/v1/batchDecrypt`, {
    cipherInfos: ciphers.map(cipherText => ({ cipherText })),
  })
  for (const p of res.plainInfos ?? []) {
    if (p.errorCode === 0 && typeof p.plainText === 'string') plain[p.cipherText] = p.plainText
  }
  return plain
}

async function applyEvent(sb: SupabaseClient, integration: KeetaIntegration, ev: KeetaEvent): Promise<string> {
  const action = keetaAction(ev)
  if (action === 'ignore' || !ev.orderId) return 'ignored'
  const storeId = integration.store_id

  if (action === 'new') {
    const { data: existing } = await sb.from('orders')
      .select('id')
      .eq('store_id', storeId).eq('platform', 'keeta').eq('platform_order_id', ev.orderId)
      .maybeSingle()
    if (existing) return 'duplicate'
    if (!ev.orderURL) throw new Error(`CREATED ${ev.orderId} without orderURL`)

    const root  = apiRoot(ev.orderURL)
    const token = await getToken(sb, integration, root)
    const order = await keetaFetch(integration, token, ev.orderURL)
    // Only own-delivery orders can be decrypted; platform ones keep those fields empty
    const plain = isKeetaOwnDelivery(order) ? await decryptAll(integration, token, root, encryptedFields(order)) : {}
    const row   = normalizeKeetaOrder(order, storeId, plain)

    const { data: parked } = await sb.from('idempotency_keys')
      .select('result').eq('key', parkedKey(ev.orderId)).maybeSingle()
    if (parked?.result?.status) row.status = parked.result.status

    const { error } = await sb.from('orders').insert(row)
    if (error?.code === '23505') return 'duplicate'
    if (error) throw new Error(`insert ${ev.orderId}: ${error.message}`)
    return 'inserted'
  }

  const { data, error } = await sb.from('orders')
    .update({ status: action })
    .eq('store_id', storeId)
    .eq('platform', 'keeta')
    .eq('platform_order_id', ev.orderId)
    .not('status', 'in', '("delivered","cancelled")')
    .select('id')
  if (error) throw new Error(`close ${ev.orderId}: ${error.message}`)
  if (data?.length) return 'closed'

  const { error: pe } = await sb.from('idempotency_keys').upsert({
    key:      parkedKey(ev.orderId),
    store_id: storeId,
    fn_name:  'keeta-events',
    result:   { status: action },
  })
  if (pe) throw new Error(`park ${ev.orderId}: ${pe.message}`)
  return 'parked'
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return problem(405, 'method not allowed')

  const raw        = await req.text()
  const signature  = req.headers.get('x-app-signature')
  const merchantId = req.headers.get('x-app-merchantid')

  // The URL Keeta signed: our public URL (+ /v1/newEvent). req.url inside the
  // runtime may differ in scheme/prefix, so every plausible form is checked.
  const reqUrl = new URL(req.url)
  const suffix = reqUrl.pathname.split(`/${FN_NAME}`)[1] ?? ''
  const base   = `${SUPABASE_URL}/functions/v1/${FN_NAME}`
  const urls   = [`${base}${suffix}`, base, `${reqUrl.origin}${reqUrl.pathname}`, `https://${reqUrl.host}${reqUrl.pathname}`]
  const params = Object.fromEntries(reqUrl.searchParams)

  const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: rows, error: le } = await sb
    .from('store_integrations')
    .select('id, store_id, client_id, client_secret, access_token, token_expires_at, merchant_id')
    .eq('platform', 'keeta').eq('active', true)
  if (le) return problem(500, 'integrations lookup failed')
  const integrations = (rows ?? []) as KeetaIntegration[]

  let integration = integrations.find(i => i.merchant_id && i.merchant_id === merchantId)
    ?? (integrations.length === 1 && !integrations[0].merchant_id ? integrations[0] : undefined)
  if (!integration?.client_secret || !(await verifyKeetaSignature(integration.client_secret, urls, params, raw, signature))) {
    // No PII in logs: only which URL forms were tried
    console.warn('[keeta-webhook] rejected: merchant=%s signed=%s urls=%s', merchantId, !!signature, urls.join(' | '))
    return problem(401, 'invalid signature')
  }

  if (!integration.merchant_id && merchantId) {
    // Bootstrap: the single unlinked store learns its Keeta merchant id
    const { error } = await sb.from('store_integrations')
      .update({ merchant_id: merchantId }).eq('id', integration.id).is('merchant_id', null)
    if (!error) integration = { ...integration, merchant_id: merchantId }
  }

  let ev: KeetaEvent
  try {
    ev = JSON.parse(raw)
  } catch {
    return problem(400, 'invalid json')
  }

  try {
    const result = await applyEvent(sb, integration, ev)
    console.log('[keeta-webhook] store=%s type=%s result=%s', integration.store_id, ev.eventType, result)
    await sb.from('store_integrations')
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id)
    return new Response(null, { status: 204 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[keeta-webhook] store=%s type=%s failed: %s', integration.store_id, ev.eventType, msg)
    await sb.from('store_integrations').update({ last_error: msg }).eq('id', integration.id)
    return problem(500, 'processing failed')
  }
})
