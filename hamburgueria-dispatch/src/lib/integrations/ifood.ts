/**
 * iFood direct integration — OAuth 2.0 client_credentials + event polling.
 *
 * This runs client-side inside the Tauri app window. API calls go through
 * Tauri's HTTP plugin to bypass CORS restrictions.
 *
 * Credentials are read from VITE_IFOOD_CLIENT_ID / VITE_IFOOD_CLIENT_SECRET.
 * Set them in .env before enabling.
 */

import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { supabase } from '../supabase'
import type { Order, Platform } from '../../types'

// ── Tauri-aware fetch ─────────────────────────────────────────────────────────

const httpFetch: typeof globalThis.fetch =
  (window as any).__TAURI_INTERNALS__ ? (tauriFetch as any) : globalThis.fetch

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL     = 'https://merchant-api.ifood.com.br'
const CLIENT_ID    = import.meta.env.VITE_IFOOD_CLIENT_ID    ?? ''
const CLIENT_SECRET = import.meta.env.VITE_IFOOD_CLIENT_SECRET ?? ''
const POLL_MS      = 30_000
const RENEW_BUFFER = 5 * 60_000  // renew 5 min before expiry

// ── Token cache ───────────────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string
  expiresAt: number  // Date.now() ms
}

let tokenCache: TokenCache | null = null

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - RENEW_BUFFER) {
    return tokenCache.accessToken
  }

  const res = await httpFetch(`${BASE_URL}/oauth/v1/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grantType:    'client_credentials',
      clientId:     CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    }).toString(),
  })

  if (!res.ok) throw new Error(`iFood auth failed: ${res.status}`)
  const json = await res.json()
  const expiresIn: number = json.expiresIn ?? 3600

  tokenCache = {
    accessToken: json.accessToken,
    expiresAt:   Date.now() + expiresIn * 1000,
  }

  return tokenCache.accessToken
}

// ── Retry helper ──────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const isRetryable =
        err?.message?.includes('5') ||   // 5xx
        err?.message?.includes('timeout') ||
        err?.message?.includes('network')
      if (!isRetryable) throw err
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }
  throw lastErr
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function ifoodGet(path: string) {
  const token = await getToken()
  const res = await httpFetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`iFood GET ${path} → ${res.status}`)
  return res.json()
}

async function ifoodPost(path: string, body?: object) {
  const token = await getToken()
  const res = await httpFetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`iFood POST ${path} → ${res.status}`)
  return res.status === 204 ? null : res.json()
}

// ── Payload normalizer ────────────────────────────────────────────────────────

function normalizeIfoodOrder(payload: any, storeId: string): Omit<Order, 'id' | 'created_at' | 'updated_at'> {
  const delivery   = payload.delivery ?? {}
  const address    = delivery.deliveryAddress ?? {}
  const customer   = payload.customer ?? {}
  const items      = (payload.items ?? []).map((item: any) => ({
    name:        item.name,
    quantity:    item.quantity,
    unit_price:  item.unitPrice ?? 0,
    total_price: item.totalPrice ?? 0,
    notes:       item.observations ?? undefined,
  }))

  return {
    store_id:           storeId,
    platform:           'ifood' as Platform,
    platform_order_id:  payload.id,
    platform_order_code: payload.displayId ?? undefined,
    customer_name:      customer.name ?? 'Cliente iFood',
    customer_phone:     customer.phone?.number ?? undefined,
    address_street:     address.streetName ?? '',
    address_number:     address.streetNumber ?? undefined,
    address_complement: address.complement ?? undefined,
    address_neighborhood: address.neighborhood ?? undefined,
    address_city:       address.city ?? undefined,
    address_zip:        address.postalCode ?? undefined,
    latitude:           address.coordinates?.latitude ?? undefined,
    longitude:          address.coordinates?.longitude ?? undefined,
    items,
    total_amount:       payload.totalPrice ?? 0,
    payment_method:     payload.payments?.[0]?.name?.toLowerCase() ?? undefined,
    delivery_type:      delivery.mode === 'TAKEOUT' ? 'pickup' : 'delivery',
    logistics_type:     delivery.deliveredBy === 'IFOOD' ? 'platform' : 'own',
    status:             'received',
    route_eligibility:  undefined,
    route_block_reason: undefined,
    rejection_count:    0,
    estimated_delivery_at: payload.preparationStartDateTime ?? undefined,
    dispatched_at:      undefined,
  }
}

// ── Event processing ──────────────────────────────────────────────────────────

async function processEvents(storeId: string, merchantId: string) {
  const events: any[] = await withRetry(() =>
    ifoodGet(`/order/v1.0/events:polling?merchantId=${merchantId}`)
  )

  if (!events?.length) return

  const ackIds: string[] = []

  for (const event of events) {
    try {
      if (event.code === 'PLACED') {
        const orderPayload = await withRetry(() =>
          ifoodGet(`/order/v1.0/orders/${event.orderId}`)
        )
        const normalized = normalizeIfoodOrder(orderPayload, storeId)
        await supabase.from('orders').insert(normalized)
      }

      if (event.code === 'CANCELLED') {
        await supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('platform', 'ifood')
          .eq('platform_order_id', event.orderId)
      }

      ackIds.push(event.id)
    } catch (err) {
      console.error(`[iFood] Error processing event ${event.id}:`, err)
    }
  }

  // Acknowledge processed events
  if (ackIds.length > 0) {
    await withRetry(() =>
      ifoodPost('/order/v1.0/events/acknowledgment', ackIds.map(id => ({ id })))
    )
  }
}

// ── Dispatch confirmation ─────────────────────────────────────────────────────

export async function confirmIfoodDispatch(platformOrderId: string): Promise<void> {
  await withRetry(() =>
    ifoodPost(`/order/v1.0/orders/${platformOrderId}/dispatch`)
  )
}

// ── Polling lifecycle ─────────────────────────────────────────────────────────

let pollInterval: ReturnType<typeof setInterval> | null = null

export function startIfoodPolling(storeId: string, merchantId: string): () => void {
  if (pollInterval) return () => {}
  if (!CLIENT_ID || !CLIENT_SECRET) return () => {}

  const run = () => processEvents(storeId, merchantId).catch(console.error)

  // First poll after 3s
  const timeout = setTimeout(run, 3_000)
  pollInterval = setInterval(run, POLL_MS)

  return () => {
    clearTimeout(timeout)
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
  }
}
