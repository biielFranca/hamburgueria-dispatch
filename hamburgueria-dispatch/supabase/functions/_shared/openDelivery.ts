import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type OdPlatform = '99food' | 'keeta'

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PAYMENT_MAP: Record<string, string> = {
  CREDIT: 'credit_card',
  DEBIT: 'debit_card',
  CASH: 'cash',
  PIX: 'pix',
  ONLINE: 'online',
  MEAL_VOUCHER: 'meal_voucher',
  FOOD_VOUCHER: 'meal_voucher',
}

const INTEGRATION_SELECT = '*'

type IntegrationRow = {
  id: string
  store_id: string
  platform: OdPlatform
  active: boolean
  client_id: string | null
  client_secret: string | null
  webhook_secret?: string | null
  access_token: string | null
  token_expires_at: string | null
}

type PlatformConfig = {
  platform: OdPlatform
  baseUrl: string
  tokenUrl: string
  eventsUrl: string
  orderUrl: (id: string) => string
  ackUrl: string
  dispatchConfirmUrl: string | null
  dispatchConfirmMethod: string
  forcePlatformLogistics: boolean
}

type TokenResult = {
  token: string
  expiresAt: Date
}

type SyncArgs = {
  platform: OdPlatform
  storeId: string
  merchantId?: string
  explicitClientSecret?: string
  explicitClientId?: string
  providedEvents?: unknown[]
  shouldAckEvents?: boolean
}

type ConfirmDispatchArgs = {
  platform: OdPlatform
  platformOrderId: string
  storeId?: string
}

type SyncResult = {
  ok: boolean
  platform: OdPlatform
  inserted: number
  events: number
  errors: string[]
  skipped?: boolean
  error?: string
}

export function jsonReply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export async function readJsonBody(req: Request): Promise<Record<string, any>> {
  try {
    return await req.json()
  } catch {
    return {}
  }
}

export function normalizePlatform(value: unknown): OdPlatform | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().toLowerCase()
  if (cleaned === '99food' || cleaned === 'keeta') {
    return cleaned
  }
  return null
}

function envFirst(names: string[]): string | null {
  for (const name of names) {
    const raw = Deno.env.get(name)
    if (raw && raw.trim()) return raw.trim()
  }
  return null
}

function platformPrefix(platform: OdPlatform): string {
  return platform.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

function nowIso() {
  return new Date().toISOString()
}

function parseBool(raw: string | null): boolean {
  if (!raw) return false
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase())
}

function resolvePlatformConfig(platform: OdPlatform): PlatformConfig {
  const prefix = platformPrefix(platform)
  const baseUrl = envFirst([
    `OPEN_DELIVERY_${prefix}_BASE_URL`,
    `OD_${prefix}_BASE_URL`,
  ]) ?? ''

  const tokenUrl = envFirst([`OPEN_DELIVERY_${prefix}_TOKEN_URL`]) ??
    (baseUrl ? `${baseUrl}/authentication/v1.0/oauth/token` : '')
  const eventsUrl = envFirst([`OPEN_DELIVERY_${prefix}_EVENTS_URL`]) ??
    (baseUrl ? `${baseUrl}/order/v1.0/events:polling` : '')
  const ackUrl = envFirst([`OPEN_DELIVERY_${prefix}_ACK_URL`]) ??
    (baseUrl ? `${baseUrl}/order/v1.0/events/acknowledgment` : '')

  const dispatchConfirmUrl = envFirst([`OPEN_DELIVERY_${prefix}_DISPATCH_CONFIRM_URL`])
  const dispatchConfirmMethod = (envFirst([`OPEN_DELIVERY_${prefix}_DISPATCH_CONFIRM_METHOD`]) ?? 'POST').toUpperCase()

  const forcePlatformLogistics = platform === 'keeta' || parseBool(
    envFirst([`OPEN_DELIVERY_${prefix}_FORCE_PLATFORM_LOGISTICS`]),
  )

  return {
    platform,
    baseUrl,
    tokenUrl,
    eventsUrl,
    orderUrl: (id: string) => `${baseUrl}/order/v1.0/orders/${id}`,
    ackUrl,
    dispatchConfirmUrl,
    dispatchConfirmMethod,
    forcePlatformLogistics,
  }
}

function ensureConfigIsUsable(config: PlatformConfig): string | null {
  if (!config.baseUrl) return `OPEN_DELIVERY_${platformPrefix(config.platform)}_BASE_URL não configurada`
  if (!config.tokenUrl || !config.eventsUrl || !config.ackUrl) {
    return `Configuração incompleta para ${config.platform} (token/events/ack URLs)`
  }
  return null
}

function parseNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const n = Number(value.replace(',', '.'))
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function parseString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function parseArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
  return []
}

function parseEvents(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  const asObj = payload as Record<string, unknown>
  if (Array.isArray(asObj.events)) return asObj.events
  if (Array.isArray(asObj.data)) return asObj.data
  if (Array.isArray(asObj.items)) return asObj.items
  if (Array.isArray(asObj.results)) return asObj.results
  return []
}

function eventOrderId(event: Record<string, unknown>): string | null {
  return parseString(
    event.orderId,
    event.order_id,
    (event.data as any)?.orderId,
    (event.payload as any)?.orderId,
    (event.order as any)?.id,
    (event.payload as any)?.order?.id,
  )
}

function eventId(event: Record<string, unknown>): string | null {
  return parseString(event.id, event.eventId, event.event_id)
}

function isPlacedEvent(event: Record<string, unknown>): boolean {
  const code = parseString(event.code, event.type, event.eventType, event.name)?.toUpperCase() ?? ''
  return (
    code.includes('PLACED') ||
    code === 'ORDER_CREATED' ||
    code === 'NEW_ORDER'
  )
}

function eventEmbeddedOrder(event: Record<string, unknown>): Record<string, unknown> | null {
  const candidates = [
    event.order,
    (event.payload as any)?.order,
    (event.data as any)?.order,
  ]
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') return candidate as Record<string, unknown>
  }
  return null
}

async function readJsonOrText(res: Response): Promise<{ json: any | null; text: string }> {
  const text = await res.text()
  if (!text.trim()) return { json: null, text: '' }
  try {
    return { json: JSON.parse(text), text }
  } catch {
    return { json: null, text }
  }
}

function buildFormBody(clientId: string, clientSecret: string, snakeCase = false): string {
  const params = new URLSearchParams()
  if (snakeCase) {
    params.set('client_id', clientId)
    params.set('client_secret', clientSecret)
    params.set('grant_type', 'client_credentials')
  } else {
    params.set('clientId', clientId)
    params.set('clientSecret', clientSecret)
    params.set('grantType', 'client_credentials')
  }
  return params.toString()
}

async function getAccessToken(config: PlatformConfig, clientId: string, clientSecret: string): Promise<TokenResult> {
  let lastError = 'Falha desconhecida ao autenticar Open Delivery'

  for (const snakeCase of [false, true]) {
    const res = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: buildFormBody(clientId, clientSecret, snakeCase),
    })
    const { json, text } = await readJsonOrText(res)

    if (!res.ok) {
      lastError = `auth failed (${res.status}): ${text || '(empty)'}`
      continue
    }

    const token = parseString(
      json?.accessToken,
      json?.access_token,
      json?.token,
    )

    if (!token) {
      lastError = `auth response without token: ${text.slice(0, 220)}`
      continue
    }

    const expiresIn = parseNumber(json?.expiresIn, json?.expires_in) ?? 21600
    const expiresAt = new Date(Date.now() + Math.max(60, expiresIn - 300) * 1000)
    return { token, expiresAt }
  }

  throw new Error(lastError)
}

async function pollEvents(config: PlatformConfig, token: string, merchantId: string): Promise<any[]> {
  const res = await fetch(config.eventsUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-merchant-id': merchantId,
    },
  })

  if (!res.ok) {
    const { text } = await readJsonOrText(res)
    throw new Error(`events polling failed (${res.status}): ${text || '(empty)'}`)
  }

  const { json, text } = await readJsonOrText(res)
  if (!text.trim()) return []
  return parseEvents(json)
}

async function fetchOrder(config: PlatformConfig, token: string, merchantId: string, orderId: string): Promise<Record<string, unknown>> {
  const res = await fetch(config.orderUrl(orderId), {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-merchant-id': merchantId,
    },
  })
  const { json, text } = await readJsonOrText(res)
  if (!res.ok) {
    throw new Error(`get order ${orderId} failed (${res.status}): ${text || '(empty)'}`)
  }
  if (!json || typeof json !== 'object') {
    throw new Error(`get order ${orderId} returned invalid payload`)
  }
  return json as Record<string, unknown>
}

async function ackEvents(config: PlatformConfig, token: string, merchantId: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  const res = await fetch(config.ackUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-merchant-id': merchantId,
    },
    body: JSON.stringify(ids.map(id => ({ id }))),
  })
  if (!res.ok) {
    const { text } = await readJsonOrText(res)
    throw new Error(`ack failed (${res.status}): ${text || '(empty)'}`)
  }
}

function normalizeItems(order: Record<string, unknown>) {
  const items = parseArray(order.items).map((item: any) => {
    const quantity = parseNumber(item.quantity, item.qty) ?? 1
    const unitPrice = parseNumber(item.unitPrice, item.price, item.unit_price) ?? 0
    const totalPrice = parseNumber(item.totalPrice, item.total_price) ?? unitPrice * quantity
    const notes = [
      parseString(item.observations, item.notes, item.note),
      ...parseArray(item.subItems).map((sub: any) =>
        `${parseNumber(sub.quantity, sub.qty) ?? 1}x ${parseString(sub.name) ?? 'item'}`
      ),
      ...parseArray(item.options).map((opt: any) => parseString(opt.name, opt.value) ?? ''),
    ].filter(Boolean).join(' | ')

    return {
      name: parseString(item.name) ?? 'Item',
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      notes: notes || undefined,
    }
  })
  return items
}

function normalizePayment(order: Record<string, unknown>): string | null {
  const raw = parseString(
    (order.payments as any)?.methods?.[0]?.method,
    (order.payment as any)?.method,
    (order.payments as any)?.[0]?.method,
    order.paymentMethod,
  )
  if (!raw) return null
  return PAYMENT_MAP[raw.toUpperCase()] ?? raw.toLowerCase()
}

function inferOwnLogistics(platformConfig: PlatformConfig, order: Record<string, unknown>): boolean {
  if (platformConfig.forcePlatformLogistics) return false
  const deliveredBy = parseString(
    (order.deliveryMethod as any)?.deliveredBy,
    (order.delivery as any)?.deliveredBy,
    (order.logistics as any)?.deliveredBy,
    (order.logistics as any)?.type,
  )?.toUpperCase() ?? ''

  if (!deliveredBy) return false
  return (
    deliveredBy.includes('MERCHANT') ||
    deliveredBy.includes('OWN') ||
    deliveredBy.includes('SELF')
  )
}

function normalizeOrder(
  order: Record<string, unknown>,
  storeId: string,
  platform: OdPlatform,
  platformConfig: PlatformConfig,
) {
  const address = (order.delivery as any)?.deliveryAddress ??
    (order.delivery as any)?.address ??
    order.deliveryAddress ??
    (order.customer as any)?.address ??
    null

  const isTakeout = (
    parseString(order.orderType, order.fulfillmentType, (order.delivery as any)?.type)?.toUpperCase() === 'TAKEOUT' ||
    parseString(order.orderType, order.fulfillmentType, (order.delivery as any)?.type)?.toUpperCase() === 'PICKUP' ||
    !address
  )

  const isOwn = inferOwnLogistics(platformConfig, order)
  const routeEligible = !isTakeout && isOwn

  const orderId = parseString(order.id, order.orderId, order.referenceCode) ?? ''
  if (!orderId) throw new Error('order payload sem identificador')

  // salesChannel (Open Delivery) indica origem real quando vem via agregador.
  const sourceChannel = parseString(
    (order as any).salesChannel,
    (order as any).sales_channel,
    (order as any).channel,
    (order as any).source,
    (order as any).origin,
    ((order as any).metadata as any)?.salesChannel,
  )?.toUpperCase() ?? null

  return {
    store_id: storeId,
    platform,
    source_channel: sourceChannel,
    platform_order_id: orderId,
    platform_order_code: parseString(order.displayId, order.code, order.referenceCode),
    customer_name: parseString((order.customer as any)?.name, order.customerName) ?? 'Cliente Open Delivery',
    customer_phone: parseString(
      (order.customer as any)?.phone?.number,
      (order.customer as any)?.phone,
      order.customerPhone,
    ),
    address_street: parseString(address?.streetName, address?.street, address?.street_name),
    address_number: parseString(address?.streetNumber, address?.number, address?.street_number),
    address_complement: parseString(address?.complement),
    address_neighborhood: parseString(address?.neighborhood),
    address_city: parseString(address?.city?.name, address?.city),
    address_zip: parseString(address?.postalCode, address?.zipCode, address?.zip_code),
    latitude: parseNumber(address?.coordinates?.latitude, address?.latitude),
    longitude: parseNumber(address?.coordinates?.longitude, address?.longitude),
    items: normalizeItems(order),
    total_amount: parseNumber(order.totalPrice, order.total, order.orderAmount) ?? 0,
    payment_method: normalizePayment(order),
    delivery_type: isTakeout ? 'pickup' : 'delivery',
    logistics_type: isOwn ? 'own' : 'platform',
    status: routeEligible ? 'awaiting_route' : 'normalized',
    route_eligibility: routeEligible ? 'eligible' : 'external_monitoring',
    rejection_count: 0,
    created_at: parseString(order.createdAt, order.created_at) ?? nowIso(),
    updated_at: nowIso(),
  }
}

function parseWebhookEvents(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  const data = payload as Record<string, unknown>
  if (Array.isArray(data.events)) return data.events as any[]
  if (Array.isArray(data.data)) return data.data as any[]
  if (data.code || data.type || data.eventType) return [data]
  if (data.order || data.orderId) return [data]
  return []
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function equalFixedTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function verifyWebhookSignature(
  platform: OdPlatform,
  storeId: string,
  rawPayload: string,
  signature?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const cleanSignature = signature?.trim()
  if (!cleanSignature) return { ok: true }

  const sb = getServiceClient()
  const integration = await getIntegration(sb, storeId, platform)
  if (!integration) {
    return {
      ok: false,
      reason: 'Integração ativa não encontrada para validar assinatura do webhook',
    }
  }

  const secret = parseString(integration.webhook_secret, integration.client_secret)
  if (!secret) {
    return {
      ok: false,
      reason: 'Assinatura recebida, mas webhook_secret/client_secret não está configurado na integração da loja',
    }
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawPayload))
  const expected = toHex(digest)
  const received = cleanSignature.toLowerCase().replace(/^sha256=/, '')

  if (!equalFixedTime(expected, received)) {
    return { ok: false, reason: 'Assinatura de webhook inválida' }
  }
  return { ok: true }
}

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no ambiente')
  }
  return createClient(url, key)
}

async function getIntegration(
  sb: ReturnType<typeof getServiceClient>,
  storeId: string,
  platform: OdPlatform,
): Promise<IntegrationRow | null> {
  const { data } = await sb
    .from('store_integrations')
    .select(INTEGRATION_SELECT)
    .eq('store_id', storeId)
    .eq('platform', platform)
    .eq('active', true)
    .maybeSingle()

  return (data as IntegrationRow | null) ?? null
}

async function updateIntegration(
  sb: ReturnType<typeof getServiceClient>,
  integrationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await sb
    .from('store_integrations')
    .update(payload)
    .eq('id', integrationId)
}

function tokenStillValid(integration: IntegrationRow): boolean {
  if (!integration.access_token || !integration.token_expires_at) return false
  const exp = new Date(integration.token_expires_at)
  return exp > new Date()
}

async function ensureToken(
  sb: ReturnType<typeof getServiceClient>,
  integration: IntegrationRow,
  config: PlatformConfig,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  if (tokenStillValid(integration)) return integration.access_token as string
  const token = await getAccessToken(config, clientId, clientSecret)
  await updateIntegration(sb, integration.id, {
    access_token: token.token,
    token_expires_at: token.expiresAt.toISOString(),
  })
  return token.token
}

export async function syncOpenDelivery(args: SyncArgs): Promise<SyncResult> {
  const config = resolvePlatformConfig(args.platform)
  const configError = ensureConfigIsUsable(config)
  if (configError) {
    return {
      ok: false,
      platform: args.platform,
      inserted: 0,
      events: 0,
      errors: [configError],
      error: configError,
    }
  }

  const sb = getServiceClient()
  const integration = await getIntegration(sb, args.storeId, args.platform)
  if (!integration) {
    return {
      ok: true,
      platform: args.platform,
      skipped: true,
      inserted: 0,
      events: 0,
      errors: [],
    }
  }

  const merchantId = parseString(args.explicitClientId, args.merchantId, integration.client_id)
  if (!merchantId) {
    const msg = 'merchantId/client_id não configurado para a integração'
    await updateIntegration(sb, integration.id, { last_error: msg })
    return {
      ok: false,
      platform: args.platform,
      inserted: 0,
      events: 0,
      errors: [msg],
      error: msg,
    }
  }

  const clientSecret = parseString(args.explicitClientSecret, integration.client_secret)
  if (!clientSecret) {
    const msg = `client_secret ausente para ${args.platform}. Configure na tabela store_integrations para esta loja.`
    await updateIntegration(sb, integration.id, { last_error: msg })
    return {
      ok: false,
      platform: args.platform,
      inserted: 0,
      events: 0,
      errors: [msg],
      error: msg,
    }
  }

  try {
    const token = await ensureToken(sb, integration, config, merchantId, clientSecret)
    const events = args.providedEvents ?? await pollEvents(config, token, merchantId)
    const placedEvents = events.filter((event) => isPlacedEvent((event ?? {}) as Record<string, unknown>))

    let inserted = 0
    const errors: string[] = []

    for (const rawEvent of placedEvents) {
      const event = (rawEvent ?? {}) as Record<string, unknown>
      const orderId = eventOrderId(event)
      if (!orderId) {
        errors.push('Evento PLACED sem orderId')
        continue
      }

      const { data: existing } = await sb
        .from('orders')
        .select('id')
        .eq('store_id', args.storeId)
        .eq('platform', args.platform)
        .eq('platform_order_id', orderId)
        .maybeSingle()

      if (existing) continue

      try {
        const order = eventEmbeddedOrder(event) ?? await fetchOrder(config, token, merchantId, orderId)
        const normalized = normalizeOrder(order, args.storeId, args.platform, config)
        const { error } = await sb.from('orders').insert(normalized)
        if (error) errors.push(`${orderId}: ${error.message}`)
        else inserted++
      } catch (error) {
        errors.push(`${orderId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (args.shouldAckEvents !== false) {
      const ids = events
        .map((event) => eventId((event ?? {}) as Record<string, unknown>))
        .filter(Boolean) as string[]
      try {
        await ackEvents(config, token, merchantId, ids)
      } catch (error) {
        errors.push(`ack: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    await updateIntegration(sb, integration.id, {
      last_sync_at: nowIso(),
      last_error: errors.length ? errors.join('; ') : null,
    })

    return {
      ok: true,
      platform: args.platform,
      inserted,
      events: events.length,
      errors,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await updateIntegration(sb, integration.id, { last_error: msg })
    return {
      ok: false,
      platform: args.platform,
      inserted: 0,
      events: 0,
      errors: [msg],
      error: msg,
    }
  }
}

export async function syncOpenDeliveryFromWebhook(args: {
  platform: OdPlatform
  storeId: string
  payload: unknown
}): Promise<SyncResult> {
  const events = parseWebhookEvents(args.payload)
  if (!events.length) {
    return {
      ok: true,
      platform: args.platform,
      inserted: 0,
      events: 0,
      errors: [],
      skipped: true,
    }
  }

  return syncOpenDelivery({
    platform: args.platform,
    storeId: args.storeId,
    providedEvents: events,
    shouldAckEvents: false,
  })
}

function httpMethodRequiresBody(method: string): boolean {
  return ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())
}

function applyOrderIdTemplate(url: string, orderId: string): string {
  return url
    .replaceAll('{orderId}', encodeURIComponent(orderId))
    .replaceAll(':orderId', encodeURIComponent(orderId))
}

async function resolveStoreIdFromOrder(
  sb: ReturnType<typeof getServiceClient>,
  platform: OdPlatform,
  platformOrderId: string,
): Promise<string | null> {
  const { data } = await sb
    .from('orders')
    .select('store_id')
    .eq('platform', platform)
    .eq('platform_order_id', platformOrderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.store_id as string | null) ?? null
}

export async function confirmOpenDeliveryDispatch(args: ConfirmDispatchArgs): Promise<Record<string, unknown>> {
  const config = resolvePlatformConfig(args.platform)
  if (!config.dispatchConfirmUrl) {
    return {
      ok: true,
      skipped: true,
      message: `OPEN_DELIVERY_${platformPrefix(args.platform)}_DISPATCH_CONFIRM_URL não configurada`,
    }
  }

  const configError = ensureConfigIsUsable(config)
  if (configError) return { ok: false, error: configError }

  const sb = getServiceClient()
  const storeId = parseString(args.storeId) ?? await resolveStoreIdFromOrder(sb, args.platform, args.platformOrderId)
  if (!storeId) {
    return { ok: false, error: 'storeId não encontrado para o pedido' }
  }

  const integration = await getIntegration(sb, storeId, args.platform)
  if (!integration) {
    return { ok: false, error: 'Integração ativa não encontrada para a loja/plataforma' }
  }

  const merchantId = parseString(integration.client_id)
  if (!merchantId) {
    return { ok: false, error: 'client_id/merchantId não configurado na integração' }
  }

  const clientSecret = parseString(integration.client_secret)
  if (!clientSecret) {
    return {
      ok: false,
      error: `client_secret ausente para ${args.platform}. Configure na integração da loja.`,
    }
  }

  try {
    const token = await ensureToken(sb, integration, config, merchantId, clientSecret)
    const method = config.dispatchConfirmMethod || 'POST'
    const targetUrl = applyOrderIdTemplate(config.dispatchConfirmUrl, args.platformOrderId)

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'x-merchant-id': merchantId,
    }
    let body: string | undefined
    if (httpMethodRequiresBody(method)) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify({
        orderId: args.platformOrderId,
        status: 'DISPATCHED',
        merchantId,
      })
    }

    const res = await fetch(targetUrl, { method, headers, body })
    const { text } = await readJsonOrText(res)

    if (!res.ok) {
      return {
        ok: false,
        error: `dispatch confirm failed (${res.status}): ${text || '(empty)'}`,
      }
    }

    return {
      ok: true,
      status: res.status,
      platform: args.platform,
      platformOrderId: args.platformOrderId,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
