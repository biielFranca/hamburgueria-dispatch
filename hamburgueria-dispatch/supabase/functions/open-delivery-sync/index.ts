import {
  CORS,
  jsonReply,
  normalizePlatform,
  readJsonBody,
  syncOpenDelivery,
} from '../_shared/openDelivery.ts'
import { resolveStoreScope } from '../_shared/requireStore.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS })
  }

  const body = await readJsonBody(req)
  const platform = normalizePlatform(body.platform)
  const bodyStoreId = typeof body.storeId === 'string' ? body.storeId.trim() : undefined
  const merchantId = typeof body.merchantId === 'string' ? body.merchantId.trim() : undefined

  if (!platform) {
    return jsonReply({
      ok: false,
      error: 'platform inválida. Use: 99food ou keeta',
      inserted: 0,
      events: 0,
      errors: [],
    })
  }

  // Security: derive storeId from the caller's JWT. Body.storeId from a
  // user-token request is ignored (or rejected if it disagrees). Only
  // service-role calls can pass storeId verbatim.
  const auth = await resolveStoreScope(req, bodyStoreId)
  if (!auth.ok) {
    return jsonReply({
      ok: false,
      error: auth.error,
      inserted: 0,
      events: 0,
      errors: [],
    }, auth.status)
  }

  try {
    const result = await syncOpenDelivery({
      platform,
      storeId: auth.storeId,
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
