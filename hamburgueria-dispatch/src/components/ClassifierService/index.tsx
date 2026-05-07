/**
 * ClassifierService — frontend fallback.
 *
 * Set VITE_BACKEND_CLASSIFIER=true to disable this component once the
 * classify-orders edge function is deployed and running.
 *
 * When VITE_BACKEND_CLASSIFIER=true this component renders nothing
 * and does not start any polling or Realtime subscriptions.
 */

import { useEffect } from 'react'
import { useAuth } from '../auth/AuthBootstrap'
import { startClassifier, classifyPendingOrders } from '../../lib/classifier'

// Realtime channel handles INSERT events; this poll is a safety net for the
// rare case Realtime drops without notification. 60s is enough — the engine
// is event-driven, not poll-driven.
const CLASSIFIER_POLL_MS = 60_000
const BACKEND_ENABLED    = import.meta.env.VITE_BACKEND_CLASSIFIER === 'true'

export default function ClassifierService() {
  const { storeId, isReady } = useAuth()

  useEffect(() => {
    if (BACKEND_ENABLED) return
    if (!isReady || !storeId) return

    const stop = startClassifier(storeId)
    classifyPendingOrders(storeId).catch(console.error)

    const pollTimer = setInterval(() => {
      classifyPendingOrders(storeId).catch(console.error)
    }, CLASSIFIER_POLL_MS)

    return () => { stop?.(); clearInterval(pollTimer) }
  }, [storeId, isReady])

  return null
}
