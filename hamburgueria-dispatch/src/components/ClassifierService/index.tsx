import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { startClassifier } from '../../lib/classifier'

/**
 * Background component that subscribes to new orders via Supabase Realtime
 * and runs the logistic classifier on each insert.
 * Renders nothing — mount once inside App.
 */
export default function ClassifierService() {
  useEffect(() => {
    let stop: (() => void) | null = null

    async function init() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return

      const { data: userData } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (!userData) return

      stop = startClassifier(userData.store_id)
    }

    init()
    return () => { stop?.() }
  }, [])

  return null
}
