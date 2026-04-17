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

  let raw = ''
  try {
    raw = await req.text()
  } catch {
    raw = ''
  }

  let parsed: Record<string, any> = {}
  try {
    parsed = raw ? JSON.parse(raw) : {}
  } catch {
    return jsonReply({ ok: false, error: 'Body inválido (JSON esperado)' })
  }

  const platform = normalizePlatform(parsed.platform)
  const storeId = typeof parsed.storeId === 'string' ? parsed.storeId.trim() : ''
  const payload = parsed.payload ?? parsed

  if (!platform) {
    return jsonReply({ ok: false, error: 'platform inválida. Use: 99food, keeta ou cardapio_web' })
  }
  if (!storeId) {
    return jsonReply({ ok: false, error: 'storeId é obrigatório' })
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
    return jsonReply(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return jsonReply({
      ok: false,
      error: msg,
      inserted: 0,
      events: 0,
      errors: [msg],
    })
  }
})
