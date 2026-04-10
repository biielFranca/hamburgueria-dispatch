import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { playAlert, isMuted, toggleMute } from '../../lib/alertSound'
import type { Order, Platform } from '../../types'
import './AlertSystem.css'

// ── Config ────────────────────────────────────────────────────────────────────

const WARNING_MS  = 5 * 60_000   // 5 min → amarelo
const URGENT_MS   = 9 * 60_000   // 9 min → laranja (1 min antes de atrasar)
const OVERDUE_MS  = 10 * 60_000  // 10 min → vermelho
const DISMISS_MS  = 7_000        // auto-dismiss após 7s
const CHECK_MS    = 20_000       // verificar a cada 20s

const PLATFORM_COLORS: Record<Platform, string> = {
  ifood:        '#EA1D2C',
  keeta:        '#27AE60',
  '99food':     '#F5A623',
  cardapio_web: '#8B5CF6',
}

const PLATFORM_LABELS: Record<Platform, string> = {
  ifood:        'iFood',
  keeta:        'Keeta',
  '99food':     '99Food',
  cardapio_web: 'Cárd. Web',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertLevel = 'warning' | 'urgent' | 'overdue'

interface AlertItem {
  uid: string
  orderId: string
  orderCode: string
  platform: Platform
  level: AlertLevel
  message: string
  createdAt: number
  dismissing: boolean
}

// ── Alert card component ──────────────────────────────────────────────────────

function AlertCard({
  alert,
  onDismiss,
}: {
  alert: AlertItem
  onDismiss: (uid: string) => void
}) {
  const color   = PLATFORM_COLORS[alert.platform]
  const elapsed = Date.now() - alert.createdAt
  const pct     = Math.max(0, 1 - elapsed / DISMISS_MS)

  const badgeLabel: Record<AlertLevel, string> = {
    warning: '5 min',
    urgent:  '1 min',
    overdue: 'Atrasado',
  }

  return (
    <div
      className={`alert-card ${alert.level} ${alert.dismissing ? 'dismissing' : ''}`}
      style={{ '--alert-platform-color': color } as React.CSSProperties}
      onClick={() => onDismiss(alert.uid)}
    >
      <div className="alert-header">
        <div className="alert-platform">
          <span className="alert-platform-dot" style={{ background: color }} />
          <span className="alert-platform-name">{PLATFORM_LABELS[alert.platform]}</span>
        </div>
        <span className="alert-order-code">{alert.orderCode}</span>
        <span className={`alert-badge ${alert.level}`}>{badgeLabel[alert.level]}</span>
      </div>

      <div className={`alert-message ${alert.level}`}>{alert.message}</div>

      <div
        className={`alert-progress ${alert.level}`}
        style={{
          transform: `scaleX(${pct})`,
          animation: `alert-progress-shrink ${DISMISS_MS}ms linear forwards`,
        }}
      />
    </div>
  )
}

// ── Mute button ───────────────────────────────────────────────────────────────

function MuteButton() {
  const [muted, setMuted] = useState(isMuted)

  useEffect(() => {
    const handler = (e: Event) => {
      setMuted((e as CustomEvent<{ muted: boolean }>).detail.muted)
    }
    window.addEventListener('alert-mute-changed', handler)
    return () => window.removeEventListener('alert-mute-changed', handler)
  }, [])

  return (
    <button
      onClick={() => toggleMute()}
      title={muted ? 'Sons silenciados — clique para ativar' : 'Silenciar sons de alerta'}
      style={{
        position:   'fixed',
        bottom:     12,
        right:      16,
        zIndex:     9000,
        background: '#111',
        border:     '1px solid #222',
        borderRadius: 6,
        color:      muted ? '#555' : '#aaa',
        cursor:     'pointer',
        padding:    '5px 8px',
        display:    'flex',
        alignItems: 'center',
        gap:        5,
        fontSize:   11,
      }}
    >
      {muted ? (
        // Muted icon
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <line x1="23" y1="9" x2="17" y2="15"/>
          <line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      ) : (
        // Sound icon
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 010 7.07"/>
          <path d="M19.07 4.93a10 10 0 010 14.14"/>
        </svg>
      )}
      {muted ? 'Mudo' : 'Sons'}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AlertSystem() {
  const [alerts, setAlerts]     = useState<AlertItem[]>([])
  const firedRef                = useRef<Set<string>>(new Set())
  const storeIdRef              = useRef<string | null>(null)

  function addAlert(order: Order, level: AlertLevel) {
    const key = `${order.id}-${level}`
    if (firedRef.current.has(key)) return
    firedRef.current.add(key)

    const code    = '#' + (order.platform_order_code || order.platform_order_id.slice(0, 8).toUpperCase())
    const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60_000)

    const messages: Record<AlertLevel, string> = {
      warning: `Pedido vai atrasar em 5 minutos!`,
      urgent:  `Despachar em menos de 1 minuto!`,
      overdue: `Pedido atrasado! (${elapsed} min sem despacho)`,
    }

    const item: AlertItem = {
      uid:        `${key}-${Date.now()}`,
      orderId:    order.id,
      orderCode:  code,
      platform:   order.platform,
      level,
      message:    messages[level],
      createdAt:  Date.now(),
      dismissing: false,
    }

    // Play sound via the new alertSound lib (respects mute + queue)
    const soundLevel = level === 'warning' ? '5min' : level === 'urgent' ? '1min' : 'critical'
    playAlert(soundLevel)

    setAlerts(prev => [item, ...prev].slice(0, 6))
    setTimeout(() => dismiss(item.uid), DISMISS_MS)
  }

  function dismiss(uid: string) {
    setAlerts(prev =>
      prev.map(a => a.uid === uid ? { ...a, dismissing: true } : a)
    )
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.uid !== uid))
    }, 250)
  }

  async function checkOrders() {
    if (!storeIdRef.current) {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return
      const { data: userData } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (!userData) return
      storeIdRef.current = userData.store_id
    }

    const { data } = await supabase
      .from('orders')
      .select('id, platform, platform_order_id, platform_order_code, created_at, status')
      .eq('store_id', storeIdRef.current)
      .not('status', 'in', '("dispatched","delivered","cancelled")')

    if (!data) return
    const now = Date.now()

    for (const order of data as Order[]) {
      const elapsed = now - new Date(order.created_at).getTime()
      if (elapsed >= OVERDUE_MS)   { addAlert(order, 'overdue');  continue }
      if (elapsed >= URGENT_MS)    { addAlert(order, 'urgent');   continue }
      if (elapsed >= WARNING_MS)   { addAlert(order, 'warning');  continue }
    }
  }

  useEffect(() => {
    checkOrders()
    const id = setInterval(checkOrders, CHECK_MS)
    return () => clearInterval(id)
  }, []) // eslint-disable-line

  return (
    <>
      <MuteButton />
      {alerts.length > 0 && (
        <div className="alert-container">
          {alerts.map(alert => (
            <AlertCard key={alert.uid} alert={alert} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </>
  )
}
