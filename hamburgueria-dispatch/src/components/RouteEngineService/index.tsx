/**
 * RouteEngineService — frontend fallback.
 *
 * Set VITE_BACKEND_ROUTE_ENGINE=true to disable once the
 * run-route-engine edge function is deployed and running.
 */

import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { startRouteEngine, runRouteEngine } from '../../lib/routeEngine'

const POLL_INTERVAL_MS  = 15_000
const BACKEND_ENABLED   = import.meta.env.VITE_BACKEND_ROUTE_ENGINE === 'true'

export default function RouteEngineService() {
  useEffect(() => {
    if (BACKEND_ENABLED) return

    let stop: (() => void) | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let storeId: string | null = null

    async function init() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return

      const { data: userData } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (!userData) return

      storeId = userData.store_id
      stop = startRouteEngine(storeId)
      await runRouteEngine(storeId)

      pollTimer = setInterval(async () => {
        if (storeId) await runRouteEngine(storeId)
      }, POLL_INTERVAL_MS)
    }

    init()
    return () => { stop?.(); if (pollTimer) clearInterval(pollTimer) }
  }, [])

  return null
}
