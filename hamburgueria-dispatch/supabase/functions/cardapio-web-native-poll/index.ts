import {
  CORS,
  fetchOrderDetail,
  fetchOrdersPolling,
  getIntegrationByStoreId,
  ingestOrder,
  jsonReply,
  markIntegrationSync,
} from '../_shared/cardapioWebNative.ts'

// Polling fallback for Cardápio Web "API Aberta".
// Webhook is preferred; this covers downtime, new deployments, and retries.
// Recommended cadence: 30s (per docs).
//
// Usage:
//   POST /functions/v1/cardapio-web-native-poll
//     body: { storeId: "<uuid>", updatedSince?: "ISO8601" }
//
// Docs: brain/Architecture/Cardapio Web API Aberta.md

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS })
  }

  let body: Record<string, unknown> = {}
  try {
    const raw = await req.text()
    body = raw ? JSON.parse(raw) : {}
  } catch {
    return jsonReply({ ok: false, error: 'Body inválido (JSON esperado)' }, 400)
  }

  const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : ''
  if (!storeId) {
    return jsonReply({ ok: false, error: 'storeId obrigatório no body' }, 400)
  }

  const integration = await getIntegrationByStoreId(storeId)
  if (!integration) {
    return jsonReply({ ok: false, error: `store ${storeId} sem integração cadastrada` }, 404)
  }
  if (!integration.api_aberta_token) {
    return jsonReply({ ok: false, error: 'integração sem api_aberta_token' }, 412)
  }

  // Default to the last 2 minutes; callers can override via body.updatedSince.
  const updatedSince =
    typeof body.updatedSince === 'string' && body.updatedSince.trim()
      ? body.updatedSince.trim()
      : new Date(Date.now() - 2 * 60 * 1000).toISOString()

  const errors: string[] = []
  let fetched = 0
  let ingested = 0

  try {
    const summaries = await fetchOrdersPolling(integration.api_aberta_token, updatedSince)
    fetched = summaries.length
    console.log('[cw-native-poll] store=%s updated_since=%s got=%d', storeId, updatedSince, fetched)

    for (const summary of summaries) {
      try {
        const order = await fetchOrderDetail(integration.api_aberta_token, summary.id)
        await ingestOrder(integration, order)
        ingested++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`order_id=${summary.id}: ${msg}`)
      }
    }

    await markIntegrationSync(integration.id, errors.length ? errors.join('\n') : undefined)

    return jsonReply({
      ok: errors.length === 0,
      store_id: storeId,
      updated_since: updatedSince,
      fetched,
      ingested,
      errors,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cw-native-poll] poll failed: %s', msg)
    await markIntegrationSync(integration.id, msg)
    return jsonReply({ ok: false, error: msg, store_id: storeId }, 500)
  }
})
