// 99Food API access (native protocol) for store-delivery actions: the
// per-store auth_token and POSTs to openapi.99food.com. Pure body building
// and 64-bit-safe parsing live in ./food99.ts.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseFood99Json } from './food99.ts'

const BASE = 'https://openapi.99food.com/v1'

export interface Food99Integration {
  id:               string
  store_id:         string
  client_id:        string | null   // app_id
  client_secret:    string | null   // app_secret
  access_token:     string | null   // the store's auth_token
  token_expires_at: string | null
}

export const FOOD99_INTEGRATION_COLUMNS = 'id, store_id, client_id, client_secret, access_token, token_expires_at'

async function food99Get(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`)
  const text = await res.text()
  if (!res.ok) throw new Error(`99Food ${path} HTTP ${res.status}: ${text.slice(0, 200)}`)
  return parseFood99Json(text)
}

/**
 * The store's auth_token (app_shop_id = our store_id). Cached in the row;
 * on expiry (errno 10102) it is refreshed and fetched again.
 */
export async function getFood99Token(sb: SupabaseClient, integration: Food99Integration): Promise<string> {
  if (integration.access_token && integration.token_expires_at && new Date(integration.token_expires_at) > new Date()) {
    return integration.access_token
  }
  const params = {
    app_id:      integration.client_id ?? '',
    app_secret:  integration.client_secret ?? '',
    app_shop_id: integration.store_id,
  }
  let res = await food99Get('/auth/authtoken/get', params)
  if (res.errno === 10102) {
    const refreshed = await food99Get('/auth/authtoken/refresh', params)
    if (refreshed.errno !== 0) throw new Error(`99Food token refresh errno ${refreshed.errno}: ${refreshed.errmsg}`)
    res = await food99Get('/auth/authtoken/get', params)
  }
  if (res.errno !== 0 || !res.data?.auth_token) throw new Error(`99Food token errno ${res.errno}: ${res.errmsg}`)

  // Expire our cache a minute early
  const expiresAt = new Date((Number(res.data.token_expiration_time) - 60) * 1000).toISOString()
  await sb.from('store_integrations')
    .update({ access_token: res.data.auth_token, token_expires_at: expiresAt })
    .eq('id', integration.id)
  integration.access_token     = res.data.auth_token
  integration.token_expires_at = expiresAt
  return res.data.auth_token
}

/** POST a pre-built JSON body (see food99Body); throws unless errno is 0. */
export async function food99Post(path: string, body: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`99Food ${path} HTTP ${res.status}: ${text.slice(0, 200)}`)
  const data = parseFood99Json(text)
  if (data.errno !== 0) throw new Error(`99Food ${path} errno ${data.errno}: ${data.errmsg}`)
  return data
}
