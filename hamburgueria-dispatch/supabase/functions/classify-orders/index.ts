/**
 * classify-orders
 *
 * Invoked by:
 *   - Supabase Database Webhook on orders INSERT/UPDATE (status='normalized')
 *   - Direct HTTP POST { store_id: string } for manual reprocess
 *
 * For each `normalized` order in the store:
 *   1. Attempt geocoding if coordinates are missing
 *   2. Apply classification rules
 *   3. Update orders row
 *   4. Write order_events audit entry
 *   5. Invoke run-route-engine if any order became awaiting_route
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveStoreScope } from '../_shared/requireStore.ts'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const NOMINATIM         = 'https://nominatim.openstreetmap.org/search'
const GEOCODE_TIMEOUT_MS = 8_000

// ── Supabase admin client ──────────────────────────────────────────────────────

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false },
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

type RouteEligibility = 'eligible' | 'awaiting' | 'blocked' | 'external_monitoring'

interface Order {
  id: string
  store_id: string
  status: string
  delivery_type: string
  logistics_type: string
  latitude: number | null
  longitude: number | null
  address_street: string | null
  address_number: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_zip: string | null
  estimated_delivery_at: string | null
  route_eligibility: string | null
  rejection_count: number
}

interface ClassificationResult {
  route_eligibility: RouteEligibility
  route_block_reason: string | null
  status: string
}

// ── Geocoder ──────────────────────────────────────────────────────────────────

interface GeoResult { latitude: number; longitude: number; source: string }

async function geocodeAddress(order: Order): Promise<GeoResult | null> {
  if (!order.address_street?.trim()) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS)

  try {
    // Strategy 1: structured query
    const p1 = new URLSearchParams({
      format: 'json', limit: '1', countrycodes: 'br',
    })
    const streetWithNum = [order.address_number, order.address_street].filter(Boolean).join(' ')
    if (streetWithNum) p1.set('street', streetWithNum)
    if (order.address_city) p1.set('city', order.address_city)
    if (order.address_zip) p1.set('postalcode', order.address_zip.replace(/\D/g, ''))

    const r1 = await fetch(`${NOMINATIM}?${p1}`, {
      headers: { 'User-Agent': 'HamburgueriaDispatch/2.0', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal: controller.signal,
    })
    if (r1.ok) {
      const d1 = await r1.json()
      if (Array.isArray(d1) && d1.length > 0) {
        clearTimeout(timer)
        return { latitude: parseFloat(d1[0].lat), longitude: parseFloat(d1[0].lon), source: 'structured' }
      }
    }

    // Strategy 2: freetext fallback
    const parts = [streetWithNum, order.address_neighborhood, order.address_city, order.address_zip, 'Brasil'].filter(Boolean)
    if (parts.length < 2) { clearTimeout(timer); return null }

    const p2 = new URLSearchParams({ q: parts.join(', '), format: 'json', limit: '1', countrycodes: 'br' })
    const r2 = await fetch(`${NOMINATIM}?${p2}`, {
      headers: { 'User-Agent': 'HamburgueriaDispatch/2.0', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal: controller.signal,
    })
    if (r2.ok) {
      const d2 = await r2.json()
      if (Array.isArray(d2) && d2.length > 0) {
        clearTimeout(timer)
        return { latitude: parseFloat(d2[0].lat), longitude: parseFloat(d2[0].lon), source: 'freetext' }
      }
    }
  } catch (err) {
    console.warn('[classify-orders] geocode error:', err)
  }

  clearTimeout(timer)
  return null
}

// ── Classification rules ──────────────────────────────────────────────────────

function classifyOrder(order: Order): ClassificationResult {
  if (order.delivery_type === 'pickup') {
    return { route_eligibility: 'blocked', route_block_reason: 'pickup_order', status: 'normalized' }
  }
  if (order.logistics_type === 'platform') {
    return { route_eligibility: 'external_monitoring', route_block_reason: null, status: 'external_monitoring' }
  }
  if (order.latitude == null || order.longitude == null) {
    return { route_eligibility: 'awaiting', route_block_reason: 'missing_coordinates', status: 'normalized' }
  }
  if (!order.address_street?.trim()) {
    return { route_eligibility: 'blocked', route_block_reason: 'invalid_address', status: 'normalized' }
  }
  if (order.estimated_delivery_at) {
    const eta = new Date(order.estimated_delivery_at).getTime()
    if (eta - Date.now() > 30 * 60_000) {
      return { route_eligibility: 'awaiting', route_block_reason: 'scheduled', status: 'normalized' }
    }
  }
  return { route_eligibility: 'eligible', route_block_reason: null, status: 'awaiting_route' }
}

// ── Audit helper ──────────────────────────────────────────────────────────────

async function logEvent(
  supabase: ReturnType<typeof adminClient>,
  orderId: string,
  storeId: string,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  metadata: Record<string, unknown> | null,
) {
  await supabase.from('order_events').insert({
    order_id:   orderId,
    store_id:   storeId,
    event_type: 'classified',
    actor_type: 'system',
    previous,
    next,
    metadata,
  })
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' },
    })
  }

  let bodyStoreId: string | undefined

  try {
    const body = await req.json()
    // DB webhook payload shape: { type, table, record, ... }
    if (body?.record?.store_id) {
      bodyStoreId = body.record.store_id
    } else if (typeof body?.store_id === 'string') {
      bodyStoreId = body.store_id
    }
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 })
  }

  // Security: derive storeId from JWT for user calls; trust body for
  // service-role callers (DB webhook, internal cross-function invocation).
  const auth = await resolveStoreScope(req, bodyStoreId)
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), { status: auth.status })
  }
  const storeId = auth.storeId

  const supabase = adminClient()

  // Fetch all normalized orders for this store
  const { data: orders, error: fetchErr } = await supabase
    .from('orders')
    .select('*')
    .eq('store_id', storeId)
    .eq('status', 'normalized')

  if (fetchErr) {
    console.error('[classify-orders] fetch error:', fetchErr.message)
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), { status: 500 })
  }

  if (!orders?.length) {
    return new Response(JSON.stringify({ ok: true, classified: 0 }))
  }

  let classified = 0
  let triggerEngine = false

  for (const order of orders as Order[]) {
    let coords: { latitude: number; longitude: number } | null = null

    // Attempt geocoding if coordinates are missing
    if ((order.latitude == null || order.longitude == null) && order.address_street?.trim()) {
      const geo = await geocodeAddress(order)
      if (geo) coords = { latitude: geo.latitude, longitude: geo.longitude }
    }

    const enriched = coords ? { ...order, ...coords } : order
    const result   = classifyOrder(enriched)

    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        route_eligibility:  result.route_eligibility,
        route_block_reason: result.route_block_reason,
        status:             result.status,
        ...(coords ?? {}),
      })
      .eq('id', order.id)
      .eq('status', 'normalized')  // idempotency guard: only update if still normalized

    if (updateErr) {
      console.warn(`[classify-orders] update failed for ${order.id}:`, updateErr.message)
      continue
    }

    await logEvent(supabase, order.id, storeId, {
      status: order.status,
      route_eligibility: order.route_eligibility,
    }, {
      status:             result.status,
      route_eligibility:  result.route_eligibility,
      route_block_reason: result.route_block_reason,
    }, coords ? { geocoded: true, source: 'backend' } : null)

    classified++
    if (result.status === 'awaiting_route') triggerEngine = true
  }

  // Trigger route engine if any orders became awaiting_route
  if (triggerEngine) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/run-route-engine`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE}`,
        },
        body: JSON.stringify({ store_id: storeId }),
      })
    } catch (err) {
      console.warn('[classify-orders] run-route-engine invoke failed:', err)
    }
  }

  return new Response(JSON.stringify({ ok: true, classified, triggerEngine }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
