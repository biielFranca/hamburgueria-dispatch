import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { syncIfood } from '../../lib/ifood'

const POLL_INTERVAL_MS = 30_000

interface PollStatus {
  lastSync: Date | null
  lastError: string | null
  syncing: boolean
}

// Exported so other components can read polling status if needed
export type { PollStatus }

export default function IfoodPoller() {
  const storeIdRef  = useRef<string | null>(null)
  const activeRef   = useRef(false)
  const [status, setStatus] = useState<PollStatus>({ lastSync: null, lastError: null, syncing: false })

  // Resolve store_id + check if integration is active
  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return

      const { data: userData } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (!userData) return

      storeIdRef.current = userData.store_id

      // Check if iFood integration is active
      const { data: integration } = await supabase
        .from('store_integrations')
        .select('active')
        .eq('store_id', userData.store_id)
        .eq('platform', 'ifood')
        .maybeSingle()

      activeRef.current = integration?.active === true
    }
    init()
  }, [])

  // Polling loop
  useEffect(() => {
    async function poll() {
      if (!storeIdRef.current || !activeRef.current) return

      setStatus(s => ({ ...s, syncing: true }))
      try {
        const result = await syncIfood(storeIdRef.current)
        setStatus({
          lastSync: new Date(),
          lastError: result.errors.length > 0 ? result.errors[0] : null,
          syncing: false,
        })
      } catch (e) {
        setStatus(s => ({
          ...s,
          lastError: e instanceof Error ? e.message : String(e),
          syncing: false,
        }))
      }
    }

    // Initial poll after short delay (let init() resolve first)
    const initialTimeout = setTimeout(poll, 3_000)
    const interval = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [])

  // No UI — this is a background component
  // Status dot shown in a small indicator bottom-left
  if (!activeRef.current && !status.lastSync) return null

  return (
    <div
      title={
        status.lastError
          ? `iFood — Erro: ${status.lastError}`
          : status.lastSync
          ? `iFood — Última sync: ${status.lastSync.toLocaleTimeString('pt-BR')}`
          : 'iFood — Aguardando...'
      }
      style={{
        position: 'fixed',
        bottom: 12,
        left: 72,
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        background: '#111',
        border: '1px solid #1e1e1e',
        borderRadius: 5,
        fontSize: 10,
        color: '#555',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: status.lastError ? '#ef4444' : status.syncing ? '#F5A623' : '#27AE60',
          flexShrink: 0,
        }}
      />
      iFood
    </div>
  )
}
