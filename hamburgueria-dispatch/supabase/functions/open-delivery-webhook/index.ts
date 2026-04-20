import {
  CORS,
  jsonReply,
  normalizePlatform,
  syncOpenDeliveryFromWebhook,
  verifyWebhookSignature,
} from '../_shared/openDelivery.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS })
  }

  const url = new URL(req.url)
  const qsPlatform = url.searchParams.get('platform')
  const qsStoreId = url.searchParams.get('storeId') ?? url.searchParams.get('store_id')

  let raw = ''
  try {
    raw = await req.text()
  } catch {
    raw = ''
  }

  // DEBUG: sempre logar payload bruto recebido para diagnóstico do webhook
  // (remover após validar fluxo real Cardápio Web → Dispatch)
  console.log('[webhook] url=%s rawLen=%d raw=%s', req.url, raw.length, raw.slice(0, 4000))

  let parsed: Record<string, any> = {}
  try {
    parsed = raw ? JSON.parse(raw) : {}
  } catch {
    return jsonReply({ ok: false, error: 'Body inválido (JSON esperado)' })
  }

  // platform/storeId podem vir de 3 lugares (prioridade): query → body wrapper → default
  const platform = normalizePlatform(qsPlatform ?? parsed.platform)
  const storeId = (
    (typeof qsStoreId === 'string' && qsStoreId.trim()) ||
    (typeof parsed.storeId === 'string' && parsed.storeId.trim()) ||
    ''
  )

  // Cardápio Web envia payload Open Delivery direto (sem wrapper platform/storeId).
  // Nesse caso, `parsed.payload` não existe → usa `parsed` inteiro como payload.
  const payload = parsed.payload ?? parsed

  if (!platform) {
    return jsonReply({ ok: false, error: 'platform inválida. Use query ?platform=cardapio_web ou body.platform' })
  }
  if (!storeId) {
    return jsonReply({ ok: false, error: 'storeId é obrigatório (query ?storeId=... ou body.storeId)' })
  }

  const signature = (
    parsed.signature ??
    req.headers.get('x-signature') ??
    req.headers.get('x-open-delivery-signature')
  ) as string | undefined

  const signatureResult = await verifyWebhookSignature(platform, storeId, JSON.stringify(payload), signature)
  if (!signatureResult.ok) {
    return jsonReply({ ok: false, error: signatureResult.reason ?? 'Assinatura inválida' })
  }

  try {
    const result = await syncOpenDeliveryFromWebhook({
      platform,
      storeId,
      payload,
    })
    console.log('[webhook] result=%s', JSON.stringify(result))
    return jsonReply(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[webhook] error=%s', msg)
    return jsonReply({
      ok: false,
      error: msg,
      inserted: 0,
      events: 0,
      errors: [msg],
    })
  }
})
