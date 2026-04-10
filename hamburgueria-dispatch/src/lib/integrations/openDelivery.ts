/**
 * Open Delivery standard integration — 99Food, Keeta, Cardápio Web.
 *
 * The Open Delivery spec defines a common OAuth 2.0 + REST interface.
 * Each platform has its own base URL and credentials but shares the same flow.
 *
 * Keeta always uses platform logistics — orders are never routed internally.
 *
 * Credentials are read from VITE_{PLATFORM}_CLIENT_ID / CLIENT_SECRET.
 */

import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { supabase } from '../supabase'
import type { Order, Platform } from '../../types'

// ── Tauri-aware fetch ─────────────────────────────────────────────────────────

const httpFetch: typeof globalThis.fetch =
  (window as any).__TAURI_INTERNALS__ ? (tauriFetch as any) : globalThis.fetch

// ── Platform configs ──────────────────────────────────────────────────────────

type OdPlatform = '99food' | 'keeta' | 'cardapio_web'

interface PlatformConfig {
  platform:     OdPlatform
  baseUrl:      string
  clientId:     string
  clientSecret: string
  webhookSecret?: string
  alwaysPlatformLogistics: boolean
}

const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    platform:    '99food',
    baseUrl:     'https://api.99food.com.br/open-delivery',
    clientId:    import.meta.env.VITE_99FOOD_CLIENT_ID    ?? '',
    clientSecret: import.meta.env.VITE_99FOOD_CLIENT_SECRET ?? '',
    alwaysPlatformLogistics: false,
  },
  {
    platform:    'keeta',
    baseUrl:     'https://api.keeta.com.br/open-delivery',
    clientId:    import.meta.env.VITE_KEETA_CLIENT_ID    ?? '',
    clientSecret: import.meta.env.VITE_KEETA_CLIENT_SECRET ?? '',
    alwaysPlatformLogistics: true,  // Keeta always uses own couriers
  },
  {
    platform:    'cardapio_web',
    baseUrl:     'https://api.cardapio.web/open-delivery',
    clientId:    import.meta.env.VITE_CARDAPIOWEB_CLIENT_ID    ?? '',
    clientSecret: import.meta.env.VITE_CARDAPIOWEB_CLIENT_SECRET ?? '',
    webhookSecret: import.meta.env.VITE_CARDAPIOWEB_WEBHOOK_SECRET ?? '',
    alwaysPlatformLogistics: false,
  },
]

const RENEW_BUFFER = 5 * 60_000

// ── Token cache per platform ──────────────────────────────────────────────────

interface TokenEntry {
  accessToken: string
  expiresAt:   number
}

const tokenCache = new Map<OdPlatform, TokenEntry>()

async function getToken(config: PlatformConfig): Promise<string> {
  const cached = tokenCache.get(config.platform)
  if (cached && Date.now() < cached.expiresAt - RENEW_BUFFER) {
    return cached.accessToken
  }

  const res = await httpFetch(`${config.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
  })

  if (!res.ok) throw new Error(`[${config.platform}] OAuth failed: ${res.status}`)
  const json = await res.json()

  const entry: TokenEntry = {
    accessToken: json.access_token,
    expiresAt:   Date.now() + (json.expires_in ?? 3600) * 1000,
  }
  tokenCache.set(config.platform, entry)
  return entry.accessToken
}

// ── Retry helper ──────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const status = parseInt(err?.message?.match(/\d{3}/)?.[0] ?? '0', 10)
      const retryable = status >= 500 || err?.message?.includes('timeout') || err?.message?.includes('network')
      if (!retryable) throw err
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }
  throw lastErr
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function odGet(config: PlatformConfig, path: string) {
  const token = await getToken(config)
  const res = await httpFetch(`${config.baseUrl}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`[${config.platform}] GET ${path} → ${res.status}`)
  return res.json()
}

async function odPost(config: PlatformConfig, path: string, body?: object) {
  const token = await getToken(config)
  const res = await httpFetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`[${config.platform}] POST ${path} → ${res.status}`)
  return res.status === 204 ? null : res.json()
}

// ── Payload normalizer ────────────────────────────────────────────────────────

function normalizeOpenDeliveryOrder(
  payload: any,
  storeId: string,
  config: PlatformConfig,
): Omit<Order, 'id' | 'created_at' | 'updated_at'> {
  const address  = payload.delivery?.deliveryAddress ?? {}
  const customer = payload.customer ?? {}
  const items    = (payload.items ?? []).map((item: any) => ({
    name:        item.name,
    quantity:    item.quantity,
    unit_price:  item.unitPrice ?? 0,
    total_price: item.totalPrice ?? 0,
    notes:       item.observations ?? undefined,
  }))

  const isPickup         = payload.delivery?.mode === 'TAKEOUT'
  const isPlatformLogistics = config.alwaysPlatformLogistics || payload.delivery?.deliveredBy === 'PLATFORM'

  return {
    store_id:             storeId,
    platform:             config.platform as Platform,
    platform_order_id:    payload.id,
    platform_order_code:  payload.displayId ?? undefined,
    customer_name:        customer.name ?? `Cliente ${config.platform}`,
    customer_phone:       customer.phone ?? undefined,
    address_street:       address.streetName ?? '',
    address_number:       address.streetNumber ?? undefined,
    address_complement:   address.complement ?? undefined,
    address_neighborhood: address.neighborhood ?? undefined,
    address_city:         address.city ?? undefined,
    address_zip:          address.postalCode ?? undefined,
    latitude:             address.coordinates?.latitude ?? undefined,
    longitude:            address.coordinates?.longitude ?? undefined,
    items,
    total_amount:         payload.totalPrice ?? 0,
    payment_method:       payload.payments?.[0]?.name?.toLowerCase() ?? undefined,
    delivery_type:        isPickup ? 'pickup' : 'delivery',
    logistics_type:       isPlatformLogistics ? 'platform' : 'own',
    status:               'received',
    // Keeta: force external_monitoring immediately
    route_eligibility:    config.alwaysPlatformLogistics ? 'external_monitoring' : undefined,
    route_block_reason:   null,
    rejection_count:      0,
    estimated_delivery_at: payload.createdAt ?? undefined,
    dispatched_at:        undefined,
  }
}

// ── Webhook handler ───────────────────────────────────────────────────────────

/**
 * Call this from wherever you receive an incoming webhook POST.
 * Validates signature (Cardápio Web) and processes the event.
 */
export async function handleOpenDeliveryWebhook(
  platform: OdPlatform,
  payload: any,
  storeId: string,
  signature?: string,
): Promise<void> {
  const config = PLATFORM_CONFIGS.find(c => c.platform === platform)
  if (!config) throw new Error(`Unknown platform: ${platform}`)

  // Signature validation for Cardápio Web
  if (platform === 'cardapio_web' && config.webhookSecret && signature) {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(config.webhookSecret)
    const msgData = encoder.encode(JSON.stringify(payload))
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sigBuffer = await crypto.subtle.sign('HMAC', key, msgData)
    const expected = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    if (signature !== expected) throw new Error('Invalid webhook signature')
  }

  if (payload.event === 'PLACED' || payload.code === 'PLACED') {
    const normalized = normalizeOpenDeliveryOrder(payload.order ?? payload, storeId, config)
    await supabase.from('orders').insert(normalized)
  }

  if (payload.event === 'CANCELLED' || payload.code === 'CANCELLED') {
    const orderId = payload.orderId ?? payload.order?.id
    if (orderId) {
      await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('platform', platform)
        .eq('platform_order_id', orderId)
    }
  }
}

// ── Dispatch confirmation ─────────────────────────────────────────────────────

export async function confirmOpenDeliveryDispatch(
  platform: OdPlatform,
  platformOrderId: string,
): Promise<void> {
  const config = PLATFORM_CONFIGS.find(c => c.platform === platform)
  if (!config) throw new Error(`Unknown platform: ${platform}`)

  await withRetry(() =>
    odPost(config, `/orders/${platformOrderId}/statusUpdate`, { status: 'DISPATCHED' })
  )
}

// ── Polling (for platforms that support it) ───────────────────────────────────

export async function pollOpenDeliveryEvents(
  platform: OdPlatform,
  storeId: string,
  merchantId: string,
): Promise<void> {
  const config = PLATFORM_CONFIGS.find(c => c.platform === platform)
  if (!config || !config.clientId) return

  const events: any[] = await withRetry(() =>
    odGet(config, `/events:polling?merchantId=${merchantId}`)
  )
  if (!events?.length) return

  for (const event of events) {
    try {
      await handleOpenDeliveryWebhook(platform, event, storeId)
    } catch (err) {
      console.error(`[${platform}] Error processing event:`, err)
    }
  }
}

export { PLATFORM_CONFIGS }
