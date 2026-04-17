import {
  CORS,
  jsonReply,
  normalizePlatform,
  readJsonBody,
  syncOpenDelivery,
} from '../_shared/openDelivery.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS })
  }

  const body = await readJsonBody(req)
  const platform = normalizePlatform(body.platform)
  const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : ''
  const merchantId = typeof body.merchantId === 'string' ? body.merchantId.trim() : undefined

  if (!platform) {
    return jsonReply({
      ok: false,
      error: 'platform inválida. Use: 99food, keeta ou cardapio_web',
      inserted: 0,
      events: 0,
      errors: [],
    })
  }

  if (!storeId) {
    return jsonReply({
      ok: false,
      error: 'storeId é obrigatório',
      inserted: 0,
      events: 0,
      errors: [],
    })
  }

  try {
    const result = await syncOpenDelivery({
      platform,
      storeId,
      merchantId,
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

