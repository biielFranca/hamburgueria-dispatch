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
import { supabase } from '../../lib/supabase'
import { startClassifier, classifyPendingOrders } from '../../lib/classifier'

const CLASSIFIER_POLL_MS   = 5_000
const BACKEND_ENABLED      = import.meta.env.VITE_BACKEND_CLASSIFIER === 'true'

export default function ClassifierService() {
  useEffect(() => {
    if (BACKEND_ENABLED) return

    let stop: (() => void) | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    async function init() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return

      const { data: userData } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (!userData) return

      const storeId = userData.store_id
      stop = startClassifier(storeId)
      await classifyPendingOrders(storeId)

      pollTimer = setInterval(() => {
        classifyPendingOrders(storeId).catch(console.error)
      }, CLASSIFIER_POLL_MS)
    }

    init()
    return () => { stop?.(); if (pollTimer) clearInterval(pollTimer) }
  }, [])

  return null
}
