import {
  CORS,
  confirmOpenDeliveryDispatch,
  jsonReply,
  normalizePlatform,
  readJsonBody,
} from '../_shared/openDelivery.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS })
  }

  const body = await readJsonBody(req)
  const platform = normalizePlatform(body.platform)
  const platformOrderId = typeof body.platformOrderId === 'string' ? body.platformOrderId.trim() : ''
  const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : undefined

  if (!platform) {
    return jsonReply({ ok: false, error: 'platform inválida. Use: 99food, keeta ou cardapio_web' })
  }

  if (!platformOrderId) {
    return jsonReply({ ok: false, error: 'platformOrderId é obrigatório' })
  }

  try {
    const result = await confirmOpenDeliveryDispatch({
      platform,
      platformOrderId,
      storeId,
    })
    return jsonReply(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return jsonReply({ ok: false, error: msg })
  }
})

