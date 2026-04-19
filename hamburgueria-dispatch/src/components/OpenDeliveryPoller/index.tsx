import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { pollOpenDeliveryEvents } from '../../lib/integrations/openDelivery'

const POLL_INTERVAL_MS = 30_000

import { PLATFORM_COLORS, PLATFORM_LABELS } from '../../lib/platformConfig'

const OD_PLATFORMS = ['keeta', '99food', 'cardapio_web'] as const
type OdPlatform = typeof OD_PLATFORMS[number]

interface PlatformStatus {
  lastSync:  Date | null
  lastError: string | null
  syncing:   boolean
}

export default function OpenDeliveryPoller() {
  const storeIdRef    = useRef<string | null>(null)
  const merchantIds   = useRef<Partial<Record<OdPlatform, string>>>({})
  const activeRef     = useRef<Partial<Record<OdPlatform, boolean>>>({})
  const [statuses, setStatuses] = useState<Partial<Record<OdPlatform, PlatformStatus>>>({})

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return

      const { data: userData } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (!userData) return

      storeIdRef.current = userData.store_id

      const { data: integrations } = await supabase
        .from('store_integrations')
        .select('platform,client_id,active')
        .eq('store_id', userData.store_id)
        .in('platform', [...OD_PLATFORMS])

      for (const int of integrations ?? []) {
        const p = int.platform as OdPlatform
        if (int.active && int.client_id) {
          activeRef.current[p]  = true
          merchantIds.current[p] = int.client_id
        }
      }
    }
    init()
  }, [])

  useEffect(() => {
    async function poll() {
      const storeId = storeIdRef.current
      if (!storeId) return

      for (const platform of OD_PLATFORMS) {
        if (!activeRef.current[platform] || !merchantIds.current[platform]) continue

        setStatuses(prev => ({
          ...prev,
          [platform]: { ...(prev[platform] ?? { lastSync: null, lastError: null }), syncing: true },
        }))

        try {
          await pollOpenDeliveryEvents(platform, storeId, merchantIds.current[platform]!)
          setStatuses(prev => ({
            ...prev,
            [platform]: { lastSync: new Date(), lastError: null, syncing: false },
          }))
        } catch (e) {
          setStatuses(prev => ({
            ...prev,
            [platform]: {
              ...(prev[platform] ?? { lastSync: null }),
              lastError: e instanceof Error ? e.message : String(e),
              syncing: false,
            },
          }))
        }
      }
    }

    const timeout  = setTimeout(poll, 3_000)
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => { clearTimeout(timeout); clearInterval(interval) }
  }, [])

  const visiblePlatforms = OD_PLATFORMS.filter(p => activeRef.current[p] || statuses[p])
  if (visiblePlatforms.length === 0) return null

  return (
    <>
      {visiblePlatforms.map((platform, i) => {
        const st    = statuses[platform]
        const label = PLATFORM_LABELS[platform]
        const color = PLATFORM_COLORS[platform]
        const dotColor = st?.lastError ? '#ef4444' : st?.syncing ? color : '#27AE60'
        const title = st?.lastError
          ? `${label} — Erro: ${st.lastError}`
          : st?.lastSync
          ? `${label} — Última sync: ${st.lastSync.toLocaleTimeString('pt-BR')}`
          : `${label} — Aguardando...`

        return (
          <div
            key={platform}
            title={title}
            style={{
              position:  'fixed',
              bottom:    12,
              left:      72 + (i + 1) * 72,
              zIndex:    9000,
              display:   'flex',
              alignItems: 'center',
              gap:        5,
              padding:   '3px 8px',
              background: '#111',
              border:    '1px solid #1e1e1e',
              borderRadius: 5,
              fontSize:  10,
              color:     '#555',
              userSelect: 'none',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
            {label}
          </div>
        )
      })}
    </>
  )
}
