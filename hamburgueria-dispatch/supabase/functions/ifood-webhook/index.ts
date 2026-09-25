// iFood → us, in real time. Registered in the iFood Developer Portal
// (Meus Apps → app → Webhook). Replaces client-side polling (roadmap 1.3).
//
// Contract (developer.ifood.com.br, events/webhook):
//  - one event per POST, signed: X-IFood-Signature = hex(HMAC-SHA256(client_secret, raw body))
//  - answer 202 within 5 s; anything else → iFood retries for up to 15 min
//  - at-least-once, no ordering, no ack → applyEvent is idempotent and parks
//    end events that arrive before their PLACED
//  - KEEPALIVE every 30 s = presence: 202 keeps the store open on iFood.
//    With no active iFood integration nothing validates → 401 → store offline.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { INTEGRATION_COLUMNS, type IfoodIntegration, applyEvent, learnMerchantId } from '../_shared/ifood.ts'
import { type IfoodEvent, isKeepalive, verifyIfoodSignature } from '../_shared/ifoodEvents.ts'

// Presence heartbeats refresh last_sync_at at most this often (status dot in the app)
const HEARTBEAT_WRITE_MS = 2 * 60_000

const accepted = () => new Response(null, { status: 202 })
const fail = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return fail(405, 'method not allowed')

  // Raw bytes first: the signature covers them exactly as sent
  const raw = new Uint8Array(await req.arrayBuffer())
  const signature = req.headers.get('x-ifood-signature')

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: rows, error: le } = await sb
    .from('store_integrations').select(INTEGRATION_COLUMNS)
    .eq('platform', 'ifood').eq('active', true)
  if (le) return fail(500, 'integrations lookup failed')
  const integrations = (rows ?? []) as IfoodIntegration[]

  // Centralized app: every store shares the app's client_secret, so this is
  // normally a single HMAC.
  const secrets = [...new Set(integrations.map(i => i.client_secret).filter((s): s is string => !!s))]
  let valid = false
  for (const secret of secrets) {
    if (await verifyIfoodSignature(secret, raw, signature)) { valid = true; break }
  }
  if (!valid) return fail(401, 'invalid signature')

  let ev: IfoodEvent
  try {
    ev = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return fail(400, 'invalid json')
  }

  if (isKeepalive(ev)) {
    const staleBefore = new Date(Date.now() - HEARTBEAT_WRITE_MS).toISOString()
    await sb.from('store_integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .in('id', integrations.map(i => i.id))
      .or(`last_sync_at.is.null,last_sync_at.lt.${staleBefore}`)
    return accepted()
  }

  let integration = integrations.find(i => i.merchant_id && i.merchant_id === ev.merchantId)
  if (!integration) {
    // Bootstrap: with a single store not yet linked, the first signed event
    // tells us its merchantId. With several unlinked stores we can't guess.
    const unlinked = integrations.filter(i => !i.merchant_id)
    if (unlinked.length === 1 && integrations.length === 1) {
      integration = unlinked[0]
      await learnMerchantId(sb, integration, ev.merchantId)
    }
  }
  if (!integration) {
    // Signed by our app but for a merchant we don't serve: accept so iFood
    // doesn't retry it for 15 min.
    console.warn('[ifood-webhook] no store for merchant=%s code=%s', ev.merchantId, ev.code)
    return accepted()
  }

  try {
    const result = await applyEvent(sb, integration, ev)
    console.log('[ifood-webhook] store=%s code=%s result=%s', integration.store_id, ev.code ?? ev.fullCode, result)
    await sb.from('store_integrations')
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id)
    return accepted()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ifood-webhook] store=%s code=%s failed: %s', integration.store_id, ev.code, msg)
    await sb.from('store_integrations').update({ last_error: msg }).eq('id', integration.id)
    // Non-2xx → iFood redelivers (30 s, then growing intervals, up to 15 min)
    return fail(500, 'processing failed')
  }
})
