import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { startClassifier, classifyPendingOrders } from '../../lib/classifier'

// Varre pedidos 'normalized' que podem ter escapado do Realtime INSERT
// (ex: Realtime não habilitado para a tabela no Supabase dashboard).
const CLASSIFIER_POLL_MS = 30_000

/**
 * Background component that subscribes to new orders via Supabase Realtime
 * and runs the logistic classifier on each insert.
 * Also scans on startup and polls every 30s to catch orders that slip through
 * if the Realtime INSERT subscription is not working.
 * Renders nothing — mount once inside App.
 */
export default function ClassifierService() {
  useEffect(() => {
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

      // Classify any orders already waiting when the app loads
      await classifyPendingOrders(storeId)

      // Poll fallback: catches orders that slipped through the Realtime subscription
      pollTimer = setInterval(() => {
        classifyPendingOrders(storeId).catch(console.error)
      }, CLASSIFIER_POLL_MS)
    }

    init()
    return () => {
      stop?.()
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [])

  return null
}
