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
  const [storeId, setStoreId] = useState<string | null>(null)
  const [active, setActive]   = useState(false)
  const activeRef             = useRef(false)
  const [status, setStatus]   = useState<PollStatus>({ lastSync: null, lastError: null, syncing: false })

  // keep ref in sync so the polling interval reads fresh value without restart
  useEffect(() => { activeRef.current = active }, [active])

  // Resolve store_id + check if integration is active + subscribe to changes
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function init() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return

      const { data: userData } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (!userData) return

      setStoreId(userData.store_id)

      // Check current state
      const { data: integration } = await supabase
        .from('store_integrations')
        .select('active')
        .eq('store_id', userData.store_id)
        .eq('platform', 'ifood')
        .maybeSingle()

      setActive(integration?.active === true)

      // Realtime: react to active toggle from Integrations page without reload
      channel = supabase
        .channel(`ifood-poller-${userData.store_id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'store_integrations',
            filter: `store_id=eq.${userData.store_id}`,
          },
          (payload) => {
            const row = (payload.new ?? payload.old) as { platform?: string; active?: boolean }
            if (row?.platform !== 'ifood') return
            if (payload.eventType === 'DELETE') {
              setActive(false)
            } else {
              setActive(row.active === true)
            }
          },
        )
        .subscribe()
    }
    init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // Polling loop — driven by storeId + active
  useEffect(() => {
    if (!storeId || !active) return

    async function poll() {
      if (!storeId || !activeRef.current) return

      setStatus(s => ({ ...s, syncing: true }))
      try {
        const result = await syncIfood(storeId)
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

    // Initial poll after short delay
    const initialTimeout = setTimeout(poll, 3_000)
    const interval = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [storeId, active])

  // No UI when integration is off and nothing synced yet
  if (!active && !status.lastSync) return null

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
          background: status.lastError
            ? '#ef4444'
            : status.syncing
              ? '#F5A623'
              : active
                ? '#27AE60'
                : '#555',
          flexShrink: 0,
        }}
      />
      iFood{!active && status.lastSync ? ' (off)' : ''}
    </div>
  )
}
