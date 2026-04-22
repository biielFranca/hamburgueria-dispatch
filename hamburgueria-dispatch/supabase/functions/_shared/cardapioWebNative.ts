// Cardápio Web "API Aberta" (native REST) integration.
//
// Separate from Open Delivery (ABRASEL). Uses a fixed per-store token in the
// `X-API-KEY` header instead of OAuth client_credentials.
//
// Webhook payload is light (just ids + status); always GET full order details.
//
// Docs: https://cardapioweb.stoplight.io/docs/api
// See also: brain/Architecture/Cardapio Web API Aberta.md

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonReply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export function getBaseUrl(): string {
  return (
    Deno.env.get('CARDAPIO_WEB_NATIVE_BASE_URL') ??
    'https://integracao.cardapioweb.com'
  )
}

// ── types ────────────────────────────────────────────────────────────────────
export type NativeWebhookEvent = {
  event_id: string
  event_type: 'ORDER_CREATED' | 'ORDER_STATUS_UPDATED' | string
  merchant_id: number
  order_id: number
  order_status: string
  created_at: string
}

export type IntegrationRow = {
  id: string
  store_id: string
  platform: string
  active: boolean | null
  api_aberta_merchant_id: number | null
  api_aberta_token: string | null
  api_aberta_webhook_token: string | null
}

export type NativeOrder = Record<string, any> & {
  id: number
  status: string
  order_type: 'delivery' | 'takeout' | 'onsite' | 'closed_table'
  order_timing?: 'immediate' | 'scheduled'
  sales_channel?: 'catalog' | 'store_front_catalog' | 'portal' | 'whatsapp_extension' | 'ifood'
  delivered_by?: 'merchant' | 'ifood' | 'ifood_shipping' | 'foody_delivery' | 'food99' | 'keeta' | 'aiqfome' | null
}

// ── helpers ──────────────────────────────────────────────────────────────────
function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return null
}

function parseNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v)
  }
  return null
}

// Cardápio Web returns sentinel coords when it can't geocode the address.
// Observed sentinels (explicit known fallbacks):
//   (-10.3333333, -53.2)   → Brazil geographic center (no address / platform pickup)
//   (-24, -47)             → SP-state round fallback (99FOOD aggregator)
// Plus generic red flags:
//   (0, 0)                 → "null island", classic uninitialized value
//   integer lat AND lng    → almost never a real address (precision < ~100 km)
//   outside Brazil bbox    → not a valid BR delivery coord
// Treating these as null prevents pins from landing far from the real address
// on the operational map.
export function isSentinelCoord(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true

  const near = (a: number, b: number, eps = 0.0001) => Math.abs(a - b) < eps

  // (0, 0) — null island
  if (near(lat, 0) && near(lng, 0)) return true

  // Known explicit sentinels observed in prod
  if (near(lat, -10.3333333) && near(lng, -53.2)) return true
  if (near(lat, -24) && near(lng, -47)) return true

  // Outside Brazil bounding box (approx.)
  //   lat: -34 (Chuí/RS) .. +6 (Monte Caburaí/RR)
  //   lng: -74 (Serra do Divisor/AC) .. -34 (Ponta do Seixas/PB)
  if (lat < -34 || lat > 6 || lng < -74 || lng > -34) return true

  // Both values are effectively integers → the platform rounded to whole degrees,
  // which can't describe any real street address (~111 km per degree).
  const isRoundInt = (v: number) => Math.abs(v - Math.round(v)) < 0.001
  if (isRoundInt(lat) && isRoundInt(lng)) return true

  return false
}

// ── integration lookup ───────────────────────────────────────────────────────
export async function getIntegrationByMerchantId(
  merchantId: number,
): Promise<IntegrationRow | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('store_integrations')
    .select(
      'id, store_id, platform, active, api_aberta_merchant_id, api_aberta_token, api_aberta_webhook_token',
    )
    .eq('platform', 'cardapio_web')
    .eq('api_aberta_merchant_id', merchantId)
    .maybeSingle()
  if (error) throw new Error(`integration lookup failed: ${error.message}`)
  return (data as IntegrationRow | null) ?? null
}

export async function getIntegrationByStoreId(
  storeId: string,
): Promise<IntegrationRow | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('store_integrations')
    .select(
      'id, store_id, platform, active, api_aberta_merchant_id, api_aberta_token, api_aberta_webhook_token',
    )
    .eq('platform', 'cardapio_web')
    .eq('store_id', storeId)
    .maybeSingle()
  if (error) throw new Error(`integration lookup failed: ${error.message}`)
  return (data as IntegrationRow | null) ?? null
}

// ── remote calls ─────────────────────────────────────────────────────────────
export async function fetchOrderDetail(
  token: string,
  orderId: number | string,
): Promise<NativeOrder> {
  const url = `${getBaseUrl()}/api/partner/v1/orders/${orderId}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-API-KEY': token, 'Accept': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GET /orders/${orderId} failed ${res.status}: ${body.slice(0, 400)}`)
  }
  return (await res.json()) as NativeOrder
}

export async function fetchOrdersPolling(
  token: string,
  updatedSinceIso?: string,
  statuses?: string[],
): Promise<Array<Pick<NativeOrder, 'id' | 'status'> & { updated_at?: string }>> {
  const url = new URL(`${getBaseUrl()}/api/partner/v1/orders`)
  if (updatedSinceIso) url.searchParams.set('updated_since', updatedSinceIso)
  if (statuses) for (const s of statuses) url.searchParams.append('status[]', s)
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-API-KEY': token, 'Accept': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GET /orders polling failed ${res.status}: ${body.slice(0, 400)}`)
  }
  return await res.json()
}

// ── mapping Pedido → orders row ──────────────────────────────────────────────
function inferSourceChannel(order: NativeOrder): string | null {
  // sales_channel values (observed in prod, superset of Stoplight docs):
  //   catalog, store_front_catalog, portal, whatsapp_extension → own
  //   ifood → IFOOD
  //   food99 → 99FOOD (consistent with Open Delivery `platform` values)
  //   keeta → KEETA
  //   aiqfome → AIQFOME
  const sc = (order.sales_channel ?? '').toString().toLowerCase()
  if (sc === 'ifood') return 'IFOOD'
  if (sc === 'food99') return '99FOOD'
  if (sc === 'keeta') return 'KEETA'
  if (sc === 'aiqfome') return 'AIQFOME'
  if (['catalog', 'store_front_catalog', 'portal', 'whatsapp_extension'].includes(sc)) {
    return 'CARDAPIO_WEB_OWN'
  }
  return sc ? sc.toUpperCase() : null
}

function inferLogisticsType(order: NativeOrder): 'own' | 'platform' {
  const delivered = (order.delivered_by ?? 'merchant').toString().toLowerCase()
  // merchant + foody_delivery = restaurant-run logistics
  if (delivered === 'merchant' || delivered === 'foody_delivery') return 'own'
  return 'platform'
}

function pickPayment(order: NativeOrder): string | null {
  const payments = Array.isArray(order.payments) ? order.payments : []
  const first = payments[0] as Record<string, unknown> | undefined
  return parseString(first?.payment_method)
}

function normalizeItems(order: NativeOrder) {
  const items = Array.isArray(order.items) ? order.items : []
  return items.map((it: Record<string, unknown>) => ({
    name: parseString((it as any).name) ?? 'Item',
    quantity: parseNumber((it as any).quantity) ?? 1,
    price: parseNumber((it as any).unit_price, (it as any).total_price) ?? 0,
    observation: parseString((it as any).observation),
    options: Array.isArray((it as any).complement_groups) ? (it as any).complement_groups : [],
  }))
}

export function mapOrderToInsert(
  order: NativeOrder,
  storeId: string,
) {
  const isDelivery = order.order_type === 'delivery'
  const address = (order as any).delivery_address ?? null
  const logisticsType = inferLogisticsType(order)
  const routeEligible = isDelivery && logisticsType === 'own'

  const platformOrderCode =
    parseString((order as any).display_id, (order as any).external_display_id) ??
    String(order.id)

  return {
    store_id: storeId,
    platform: 'cardapio_web',
    source_channel: inferSourceChannel(order),
    platform_order_id: String(order.id),
    platform_order_code: platformOrderCode,
    customer_name:
      parseString(address?.name, (order as any).customer?.name) ?? 'Cliente Cardápio Web',
    customer_phone: parseString(
      (order as any).customer?.phone,
      (order as any).customer?.phone_number,
    ),
    // address_street is NOT NULL in orders table; platform-delivery and pickup
    // orders frequently lack address, so fall back to a placeholder.
    address_street: parseString(address?.street) ?? '—',
    address_number: parseString(address?.number),
    address_complement: parseString(address?.complement),
    address_neighborhood: parseString(address?.neighborhood),
    address_city: parseString(address?.city),
    address_zip: parseString(address?.zip_code, address?.postal_code),
    latitude: isSentinelCoord(parseNumber(address?.latitude), parseNumber(address?.longitude))
      ? null
      : parseNumber(address?.latitude),
    longitude: isSentinelCoord(parseNumber(address?.latitude), parseNumber(address?.longitude))
      ? null
      : parseNumber(address?.longitude),
    items: normalizeItems(order),
    total_amount: parseNumber((order as any).total) ?? 0,
    payment_method: pickPayment(order),
    delivery_type: isDelivery ? 'delivery' : 'pickup',
    logistics_type: logisticsType,
    status: routeEligible ? 'awaiting_route' : 'normalized',
    route_eligibility: routeEligible ? 'eligible' : 'external_monitoring',
    rejection_count: 0,
    created_at: parseString((order as any).created_at) ?? nowIso(),
    updated_at: nowIso(),
  }
}

// ── ingest a single order (called from webhook + poll) ───────────────────────
export async function ingestOrder(
  integration: IntegrationRow,
  order: NativeOrder,
): Promise<{ ok: true; inserted: boolean }> {
  const supabase = getServiceClient()
  const row = mapOrderToInsert(order, integration.store_id)
  const { error } = await supabase
    .from('orders')
    .upsert(row, { onConflict: 'store_id,platform,platform_order_id' })
  if (error) throw new Error(`orders upsert failed: ${error.message}`)
  return { ok: true, inserted: true }
}

export async function markIntegrationSync(
  integrationId: string,
  lastError?: string,
) {
  const supabase = getServiceClient()
  await supabase
    .from('store_integrations')
    .update({
      last_sync_at: nowIso(),
      last_error: lastError ?? null,
    })
    .eq('id', integrationId)
}

// ── webhook signature (optional X-Webhook-Token compare) ────────────────────
export function verifyWebhookToken(
  expected: string | null,
  received: string | null,
): { ok: boolean; reason?: string } {
  if (!expected) return { ok: true } // no token configured = accept
  if (!received) return { ok: false, reason: 'X-Webhook-Token ausente' }
  if (expected.length !== received.length) {
    return { ok: false, reason: 'X-Webhook-Token inválido' }
  }
  // constant-time compare
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i)
  }
  return diff === 0 ? { ok: true } : { ok: false, reason: 'X-Webhook-Token inválido' }
}
