// Keeta API access shared by keeta-webhook (fetch/confirm orders) and
// platform-dispatch (dispatch notice): app-level token + signed requests.
// Pure signing rules live in ./keeta.ts.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { canonicalJson, keetaSign, keetaSignatureString } from './keeta.ts'

export interface KeetaIntegration {
  id:               string
  store_id:         string
  client_id:        string | null
  client_secret:    string | null
  access_token:     string | null
  token_expires_at: string | null
  merchant_id:      string | null
}

export const KEETA_INTEGRATION_COLUMNS =
  'id, store_id, client_id, client_secret, access_token, token_expires_at, merchant_id'

/** Keeta Open Delivery API root (docs: "servers"). Webhooks also hand us orderURL. */
export const KEETA_API_ROOT = Deno.env.get('KEETA_API_ROOT') ?? 'https://open.mykeeta.com/api/open/opendelivery'

// orderURL looks like https://<keeta host>/<prefix>/v1/orders/<id>; the API
// root (token, batchDecrypt, actions) is everything before /v1/orders.
export function apiRootFromOrderUrl(orderUrl: string): string {
  const u = new URL(orderUrl)
  if (u.protocol !== 'https:') throw new Error('orderURL must be https')
  const i = u.pathname.indexOf('/v1/orders')
  return `${u.origin}${i >= 0 ? u.pathname.slice(0, i) : ''}`
}

export async function getKeetaToken(sb: SupabaseClient, integration: KeetaIntegration, root: string): Promise<string> {
  if (integration.access_token && integration.token_expires_at && new Date(integration.token_expires_at) > new Date()) {
    return integration.access_token
  }
  const res = await fetch(`${root}/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      client_id:     integration.client_id,
      client_secret: integration.client_secret,
      grant_type:    'app_level_token',
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Keeta auth failed (${res.status}): ${text.slice(0, 200) || '(empty)'}`)
  const data = JSON.parse(text)
  if (!data.access_token) throw new Error('Keeta auth returned no access_token')
  const expiresAt = new Date(Date.now() + Math.max(60, (data.expires_in ?? 3600) - 300) * 1000).toISOString()
  await sb.from('store_integrations')
    .update({ access_token: data.access_token, token_expires_at: expiresAt })
    .eq('id', integration.id)
  integration.access_token     = data.access_token
  integration.token_expires_at = expiresAt
  return data.access_token
}

/** Signed request to Keeta (same signature scheme it uses on webhooks). */
export async function keetaFetch(integration: KeetaIntegration, token: string, url: string, body?: unknown) {
  const u = new URL(url)
  const params = Object.fromEntries(u.searchParams)
  const payload = body === undefined ? '' : canonicalJson(body)
  const signature = await keetaSign(integration.client_secret!, keetaSignatureString(`${u.origin}${u.pathname}`, params, payload))
  const headers: Record<string, string> = {
    Authorization:     `Bearer ${token}`,
    'X-App-Signature': signature,
  }
  if (integration.merchant_id) headers['X-App-MerchantId'] = integration.merchant_id
  if (payload) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, { method: payload ? 'POST' : 'GET', headers, body: payload || undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(`${u.pathname} failed (${res.status}): ${text.slice(0, 200) || '(empty)'}`)
  // actions (confirm, dispatch…) answer 202 with no body
  return text.trim() ? JSON.parse(text) : null
}
