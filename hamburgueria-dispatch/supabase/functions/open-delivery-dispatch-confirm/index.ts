import {
  CORS,
  confirmOpenDeliveryDispatch,
  jsonReply,
  normalizePlatform,
  readJsonBody,
} from '../_shared/openDelivery.ts'
import { resolveStoreScope } from '../_shared/requireStore.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS })
  }

  const body = await readJsonBody(req)
  const platform = normalizePlatform(body.platform)
  const platformOrderId = typeof body.platformOrderId === 'string' ? body.platformOrderId.trim() : ''
  const bodyStoreId = typeof body.storeId === 'string' ? body.storeId.trim() : undefined

  if (!platform) {
    return jsonReply({ ok: false, error: 'platform inválida. Use: 99food, keeta ou cardapio_web' })
  }

  if (!platformOrderId) {
    return jsonReply({ ok: false, error: 'platformOrderId é obrigatório' })
  }

  // Security: storeId is derived from the JWT, not trusted from the body.
  const auth = await resolveStoreScope(req, bodyStoreId)
  if (!auth.ok) {
    return jsonReply({ ok: false, error: auth.error }, auth.status)
  }

  try {
    const result = await confirmOpenDeliveryDispatch({
      platform,
      platformOrderId,
      storeId: auth.storeId,
    })
    return jsonReply(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return jsonReply({ ok: false, error: msg })
  }
})
