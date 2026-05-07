/**
 * RouteEngineService — frontend fallback.
 *
 * Set VITE_BACKEND_ROUTE_ENGINE=true to disable once the
 * run-route-engine edge function is deployed and running.
 */

import { useEffect } from 'react'
import { useAuth } from '../auth/AuthBootstrap'
import { startRouteEngine, runRouteEngine } from '../../lib/routeEngine'

// Realtime channel handles UPDATE events; this poll is a safety net.
const POLL_INTERVAL_MS = 60_000
const BACKEND_ENABLED  = import.meta.env.VITE_BACKEND_ROUTE_ENGINE === 'true'

export default function RouteEngineService() {
  const { storeId, isReady } = useAuth()

  useEffect(() => {
    if (BACKEND_ENABLED) return
    if (!isReady || !storeId) return

    const stop = startRouteEngine(storeId)
    runRouteEngine(storeId).catch(e => console.error('[RouteEngine] initial run error:', e))

    const pollTimer = setInterval(() => {
      runRouteEngine(storeId).catch(e => console.error('[RouteEngine] poll run error:', e))
    }, POLL_INTERVAL_MS)

    return () => { stop?.(); clearInterval(pollTimer) }
  }, [storeId, isReady])

  return null
}
