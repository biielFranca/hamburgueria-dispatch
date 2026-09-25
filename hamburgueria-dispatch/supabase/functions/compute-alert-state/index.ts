/**
 * compute-alert-state
 *
 * Cron edge function — runs every 30s via Supabase pg_cron or external scheduler.
 * Calls recompute_all_alert_levels() which updates orders.alert_level in bulk.
 * Frontend AlertSystem reads alert_level via Realtime instead of computing locally.
 *
 * Schedule (add to supabase/config.toml or via dashboard):
 *   every 30 seconds → invoke compute-alert-state
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' },
    })
  }

  // Cron-only: recomputes alert levels for every store, so only the
  // service-role key may trigger it. Anyone else gets 401.
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (bearer !== SUPABASE_SERVICE) {
    return new Response(JSON.stringify({ ok: false, error: 'service role required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false },
  })

  const { error } = await db.rpc('recompute_all_alert_levels')

  if (error) {
    console.error('[compute-alert-state] error:', error.message)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
