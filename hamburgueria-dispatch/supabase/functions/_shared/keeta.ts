// Pure Keeta rules (Keeta's Open Delivery implementation). No Supabase, no
// fetch, no Deno APIs — runs in Edge Functions and in Vitest.
// Docs: api-docs.mykeeta.com/apis/opendelivery (Order-Webhook, Signature
// Calculation, Get Order Details, BatchDecrypt).

export interface KeetaEvent {
  eventId?:   string
  eventType?: string
  orderId?:   string
  orderURL?:  string
  createdAt?: string
}

/** RFC 8785 (JCS): sorted keys, no whitespace, ECMAScript number formatting. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const obj = value as Record<string, unknown>
  // Default sort compares UTF-16 code units, which is what JCS requires
  return `{${Object.keys(obj).sort()
    .filter(k => obj[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`
}

/**
 * signature_string = url [+ "&" + sorted "k=v" params] [+ "&" + body]
 * (Keeta's reference implementation: params and body are skipped when empty).
 */
export function keetaSignatureString(url: string, params: Record<string, string>, body: string): string {
  let s = url
  for (const key of Object.keys(params).sort()) s += `&${key}=${params[key] ?? ''}`
  if (body.trim()) s += `&${body}`
  return s
}

/** X-App-Signature = base64(HMAC-SHA256(client_secret, signature_string)). */
export async function keetaSign(secret: string, signatureString: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signatureString)))
  let bin = ''
  for (const b of mac) bin += String.fromCharCode(b)
  return btoa(bin)
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Checks a webhook signature against every plausible signing input. The docs
 * don't pin down which URL Keeta signs for our endpoint (with or without the
 * /v1/newEvent suffix) or whether it signs the body as sent or canonicalized,
 * so all combinations are tried — each still needs our client secret.
 */
export async function verifyKeetaSignature(
  secret: string,
  urls: string[],
  params: Record<string, string>,
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!secret || !signature) return false
  const bodies = [rawBody]
  try {
    const canonical = canonicalJson(JSON.parse(rawBody))
    if (canonical !== rawBody) bodies.push(canonical)
  } catch { /* not JSON — raw only */ }

  const got = signature.trim()
  for (const url of new Set(urls)) {
    for (const body of bodies) {
      if (safeEqual(await keetaSign(secret, keetaSignatureString(url, params, body)), got)) return true
    }
  }
  return false
}

export type KeetaAction = 'new' | 'cancelled' | 'delivered' | 'ignore'

// CREATED = new order; CANCELLED is final (a cancellation *request* is not);
// DELIVERED/CONCLUDED end the order. Everything else is progress we don't track.
export function keetaAction(ev: KeetaEvent): KeetaAction {
  switch (ev.eventType) {
    case 'CREATED':   return 'new'
    case 'CANCELLED': return 'cancelled'
    case 'DELIVERED':
    case 'CONCLUDED': return 'delivered'
    default:          return 'ignore'
  }
}

/**
 * Body for POST /v1/orders/{id}/confirm. Keeta cancels orders not confirmed
 * within 5 minutes (and may close the store), so orders are auto-accepted
 * (Decision 016). orderExternalCode = our orders.id.
 */
export function keetaConfirmBody(ourOrderId: string, now = new Date()) {
  return {
    createdAt:         now.toISOString(),
    orderExternalCode: ourOrderId,
    reason:            'Aceite automático (hamburgueria-dispatch)',
  }
}

const isEncrypted = (v: unknown): v is string => typeof v === 'string' && v.startsWith('ENC_')

/** Personal data Keeta returns as `ENC_…` ciphertext (BatchDecrypt docs). */
export function encryptedFields(order: any): string[] {
  const a = order?.delivery?.deliveryAddress ?? {}
  return [order?.customer?.phone?.number, a.district, a.number, a.complement, a.formattedAddress]
    .filter(isEncrypted)
}

/** Keeta can only decrypt personal data when the store itself delivers. */
export function isKeetaOwnDelivery(order: any): boolean {
  return order?.type === 'DELIVERY' && order?.delivery?.deliveredBy === 'MERCHANT'
}

const PAYMENT: Record<string, string> = {
  CREDIT: 'credit_card', CREDIT_DEBIT: 'credit_card', DEBIT: 'debit_card',
  CASH: 'cash', PIX: 'pix', DIGITAL_WALLET: 'online',
  MEAL_VOUCHER: 'meal_voucher', FOOD_VOUCHER: 'meal_voucher',
}

const money = (m: any) => (typeof m?.value === 'number' ? m.value : Number(m?.value ?? 0))
const text  = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Keeta order (GET /v1/orders/{id}) → orders row. `plain` maps each `ENC_`
 * ciphertext to its decrypted value; anything still encrypted is dropped
 * (never stored as ciphertext).
 */
export function normalizeKeetaOrder(order: any, storeId: string, plain: Record<string, string> = {}, now = new Date()) {
  const open = (v: unknown) => {
    if (!isEncrypted(v)) return text(v)
    return text(plain[v])
  }
  const addr     = order.delivery?.deliveryAddress ?? {}
  const isPickup = order.type !== 'DELIVERY'
  const isOwn    = isKeetaOwnDelivery(order)

  const items = (order.items ?? []).map((it: any) => ({
    name:        it.name,
    quantity:    it.quantity ?? 1,
    unit_price:  money(it.unitPrice),
    total_price: money(it.totalPrice),
    notes: [text(it.specialInstructions), ...(it.options ?? []).map((o: any) => `${o.quantity ?? 1}x ${o.name}`)]
      .filter(Boolean).join(' | ') || undefined,
  }))

  const method = order.payments?.methods?.[0]?.method as string | undefined

  return {
    store_id:             storeId,
    platform:             'keeta',
    source_channel:       text(order.salesChannel)?.toUpperCase() ?? null,
    platform_order_id:    String(order.id),
    platform_order_code:  text(order.displayId),
    customer_name:        text(order.customer?.name) ?? 'Cliente Keeta',
    customer_phone:       open(order.customer?.phone?.number),
    address_street:       open(addr.street) ?? open(addr.formattedAddress),
    address_number:       open(addr.number),
    address_complement:   open(addr.complement),
    address_neighborhood: open(addr.district),
    address_city:         text(addr.city),
    address_zip:          text(addr.postalCode),
    latitude:             typeof addr.coordinates?.latitude === 'number' ? addr.coordinates.latitude : null,
    longitude:            typeof addr.coordinates?.longitude === 'number' ? addr.coordinates.longitude : null,
    items,
    total_amount:         money(order.total?.orderAmount),
    payment_method:       method ? (PAYMENT[method] ?? method.toLowerCase()) : null,
    delivery_type:        isPickup ? 'pickup' : 'delivery',
    logistics_type:       isOwn ? 'own' : 'platform',
    status:               isOwn ? 'awaiting_route' : 'normalized',
    route_eligibility:    isOwn ? 'eligible' : 'external_monitoring',
    rejection_count:      0,
    created_at:           text(order.createdAt) ?? now.toISOString(),
    updated_at:           now.toISOString(),
  }
}
