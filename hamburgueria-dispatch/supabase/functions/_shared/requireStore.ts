// Shared auth helper for edge functions that must be scoped to a single
// store. Derives store_id from the caller's JWT instead of trusting the
// request body — otherwise any authenticated user (or anyone with the
// publishable anon key) can pass an arbitrary storeId and operate on
// another tenant's data.
//
// Usage in a function:
//   const auth = await requireStoreFromJwt(req)
//   if (!auth.ok) return jsonReply({ ok: false, error: auth.error }, auth.status)
//   const storeId = auth.storeId
//
// Functions that may also be invoked by service-role contexts (DB
// webhooks, cron, cross-function calls) should use `resolveStoreScope`
// which falls back to body.storeId only when the request carries the
// service-role JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export type StoreAuth =
  | { ok: true; storeId: string; isServiceRole: boolean }
  | { ok: false; error: string; status: number }

function getBearer(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? req.headers.get('authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

/**
 * Resolves the store scope for a request.
 *
 * Behavior:
 *   - If the caller presents the service-role JWT, accept body.storeId
 *     verbatim (cron jobs, DB webhooks, internal cross-function calls).
 *   - Otherwise, look up the user from the JWT and read their store_id
 *     from the users table. body.storeId is ignored unless it matches.
 *   - If neither path resolves, return ok=false.
 */
export async function resolveStoreScope(
  req: Request,
  bodyStoreId?: string,
): Promise<StoreAuth> {
  const token = getBearer(req)
  if (!token) {
    return { ok: false, error: 'missing Authorization bearer', status: 401 }
  }

  // Service-role caller: trust the body.
  if (token === SUPABASE_SERVICE_KEY) {
    if (!bodyStoreId) {
      return { ok: false, error: 'storeId is required for service-role calls', status: 400 }
    }
    return { ok: true, storeId: bodyStoreId, isServiceRole: true }
  }

  // User caller: derive store_id from their JWT, ignore body claim.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return { ok: false, error: 'invalid auth token', status: 401 }
  }

  // Use service-role to read the users table (RLS allows self-read but
  // service-role keeps the lookup independent of policy edge cases).
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })
  const { data: profile, error: profileErr } = await admin
    .from('users')
    .select('store_id')
    .eq('auth_id', userData.user.id)
    .single()
  if (profileErr || !profile?.store_id) {
    return { ok: false, error: 'user has no store assignment', status: 403 }
  }

  // If the body asserted a different storeId, refuse — caller is trying
  // to act on another tenant.
  if (bodyStoreId && bodyStoreId !== profile.store_id) {
    return { ok: false, error: 'storeId mismatch with authenticated user', status: 403 }
  }

  return { ok: true, storeId: profile.store_id, isServiceRole: false }
}

/**
 * Convenience wrapper for endpoints that should ONLY be called by
 * authenticated users (never service-role).
 */
export async function requireStoreFromJwt(
  req: Request,
  bodyStoreId?: string,
): Promise<StoreAuth> {
  const result = await resolveStoreScope(req, bodyStoreId)
  if (result.ok && result.isServiceRole) {
    return { ok: false, error: 'service-role not allowed for this endpoint', status: 403 }
  }
  return result
}
