import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { startRouteEngine } from '../../lib/routeEngine'

/**
 * Background component that subscribes to order status changes
 * and fires the route engine when an order reaches awaiting_route.
 * Renders nothing — mount once inside App.
 */
export default function RouteEngineService() {
  useEffect(() => {
    let stop: (() => void) | null = null

    async function init() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return

      const { data: userData } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (!userData) return

      stop = startRouteEngine(userData.store_id)
    }

    init()
    return () => { stop?.() }
  }, [])

  return null
}
