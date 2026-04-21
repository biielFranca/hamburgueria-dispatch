import {
  CORS,
  fetchOrderDetail,
  getIntegrationByMerchantId,
  ingestOrder,
  jsonReply,
  markIntegrationSync,
  NativeWebhookEvent,
  verifyWebhookToken,
} from '../_shared/cardapioWebNative.ts'

// Webhook endpoint for Cardápio Web "API Aberta" (native REST).
//
// Cardápio Web posts a lightweight event envelope:
//   { event_id, event_type, merchant_id, order_id, order_status, created_at }
// We look up the store via merchant_id, fetch the full Pedido via
// GET /api/partner/v1/orders/{order_id} using the per-store X-API-KEY, and
// upsert into `orders`.
//
// Docs: brain/Architecture/Cardapio Web API Aberta.md

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS })
  }

  let raw = ''
  try {
    raw = await req.text()
  } catch {
    raw = ''
  }

  console.log('[cw-native-webhook] url=%s rawLen=%d raw=%s', req.url, raw.length, raw.slice(0, 2000))

  let parsed: NativeWebhookEvent | null = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    return jsonReply({ ok: false, error: 'Body inválido (JSON esperado)' }, 200)
  }
  if (!parsed || typeof parsed !== 'object') {
    return jsonReply({ ok: false, error: 'payload vazio' }, 200)
  }

  const merchantId = Number(parsed.merchant_id)
  const orderId = Number(parsed.order_id)
  const eventType = parsed.event_type ?? 'unknown'

  if (!Number.isFinite(merchantId) || !Number.isFinite(orderId)) {
    return jsonReply({
      ok: false,
      error: 'merchant_id / order_id inválido',
      event: { merchantId, orderId, eventType },
    }, 200)
  }

  const integration = await getIntegrationByMerchantId(merchantId)
  if (!integration) {
    console.warn('[cw-native-webhook] no integration for merchant_id=%s', merchantId)
    // Always respond 200 so Cardápio Web doesn't retry us on permanent misconfig.
    return jsonReply({ ok: false, error: `merchant_id ${merchantId} desconhecido` }, 200)
  }
  if (!integration.api_aberta_token) {
    console.warn('[cw-native-webhook] integration missing api_aberta_token for store=%s', integration.store_id)
    return jsonReply({ ok: false, error: 'integração sem token cadastrado' }, 200)
  }

  const signatureResult = verifyWebhookToken(
    integration.api_aberta_webhook_token,
    req.headers.get('x-webhook-token'),
  )
  if (!signatureResult.ok) {
    console.warn('[cw-native-webhook] signature rejected: %s', signatureResult.reason)
    return jsonReply({ ok: false, error: signatureResult.reason ?? 'assinatura inválida' }, 401)
  }

  // Status-only events for table/comanda orders don't warrant a GET.
  if (eventType !== 'ORDER_CREATED' && eventType !== 'ORDER_STATUS_UPDATED') {
    return jsonReply({ ok: true, skipped: true, reason: `event_type=${eventType} ignorado` })
  }

  try {
    const order = await fetchOrderDetail(integration.api_aberta_token, orderId)
    const result = await ingestOrder(integration, order)
    await markIntegrationSync(integration.id)
    console.log(
      '[cw-native-webhook] ingested order_id=%s status=%s source=%s',
      orderId,
      order.status,
      order.sales_channel,
    )
    return jsonReply({
      ok: true,
      event_type: eventType,
      order_id: orderId,
      merchant_id: merchantId,
      inserted: result.inserted,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cw-native-webhook] ingest failed: %s', msg)
    await markIntegrationSync(integration.id, msg)
    // Return 200 with ok:false so Cardápio Web doesn't retry 15x on a schema bug;
    // we re-fetch via polling fallback anyway.
    return jsonReply({ ok: false, error: msg, order_id: orderId, merchant_id: merchantId })
  }
})
