import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { startRouteEngine, runRouteEngine } from '../../lib/routeEngine'

const POLL_INTERVAL_MS = 60_000  // re-run every 60s to catch solo orders past the 10-min wait

/**
 * Background component that subscribes to order status changes
 * and fires the route engine when an order reaches awaiting_route.
 * Also polls every 60s so solo orders are dispatched after their wait expires.
 * Renders nothing — mount once inside App.
 */
export default function RouteEngineService() {
  useEffect(() => {
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

      // Run once immediately to process any orders already waiting when the app loads
      await runRouteEngine(storeId)

      // Periodic poll: catches solo orders whose 10-min wait has elapsed
      // but no new order arrived to re-trigger the Realtime listener
      pollTimer = setInterval(async () => {
        if (storeId) await runRouteEngine(storeId)
      }, POLL_INTERVAL_MS)
    }

    init()
    return () => {
      stop?.()
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [])

  return null
}
