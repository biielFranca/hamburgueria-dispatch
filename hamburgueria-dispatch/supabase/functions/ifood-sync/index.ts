// Manual reconciliation: pulls pending iFood events via events:polling and
// applies them. The real-time path is ifood-webhook; this one backs it up
// (the "sincronizar agora" button) for events the webhook lost.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveStoreScope } from '../_shared/requireStore.ts'
import {
  INTEGRATION_COLUMNS, type IfoodIntegration,
  ackEvents, applyEvent, getValidToken, learnMerchantId, pollEvents,
} from '../_shared/ifood.ts'
import { isPlaced } from '../_shared/ifoodEvents.ts'

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
  // service-role caller may pass storeId in the body. Anything else is
  // rejected before touching iFood or the database.
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
      .from('store_integrations').select(INTEGRATION_COLUMNS)
      .eq('store_id', storeId).eq('platform', 'ifood').eq('active', true)
      .maybeSingle<IfoodIntegration>()

    if (!integration) {
      return reply({ ok: true, skipped: true, inserted: 0, events: 0, errors: [] })
    }

    let events
    try {
      events = await pollEvents(await getValidToken(sb, integration))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await sb.from('store_integrations').update({ last_error: msg }).eq('id', integration.id)
      return reply({ ok: false, error: msg, inserted: 0, events: 0, errors: [msg] })
    }
    if (events.length) {
      // Codes only (no customer data) — lets us see which event types arrive.
      console.log('[ifood-sync] store=%s events=%s', storeId, events.map(e => e.code ?? e.fullCode).join(','))
    }

    // A centralized app polls events for every merchant that authorized it;
    // once this store's merchant is known, leave the others alone (unacked).
    await learnMerchantId(sb, integration, events[0]?.merchantId)
    const mine = events.filter(e => !integration.merchant_id || !e.merchantId || e.merchantId === integration.merchant_id)

    // PLACED first, so a PLACED + CANCELLED in the same batch ends up cancelled
    const ordered = [...mine.filter(isPlaced), ...mine.filter(e => !isPlaced(e))]
    let inserted = 0
    let closed   = 0
    const errors: string[] = []
    // iFood never redelivers an acknowledged event, so an event that failed
    // must stay un-acked and come back next poll.
    const failedEventIds = new Set<string>()

    for (const ev of ordered) {
      try {
        const result = await applyEvent(sb, integration, ev)
        if (result === 'inserted') inserted++
        if (result === 'closed') closed++
      } catch (e) {
        errors.push(`${ev.orderId}: ${e instanceof Error ? e.message : String(e)}`)
        failedEventIds.add(ev.id)
      }
    }

    await ackEvents(integration.access_token!, mine.filter(e => !failedEventIds.has(e.id)).map(e => e.id))
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
