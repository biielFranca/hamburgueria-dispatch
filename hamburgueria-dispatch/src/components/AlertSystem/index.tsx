/**
 * AlertSystem — display layer only.
 *
 * Reads orders.alert_level from Supabase Realtime (set by compute-alert-state
 * edge function). Does NOT compute severity locally anymore.
 *
 * Responsibilities:
 *  - Subscribe to order changes for the current store
 *  - New order (INSERT): chime + Windows notification + sticky card; the chime
 *    repeats every NEW_ORDER_REPEAT_MS until the card/notification is clicked
 *    or the order is dispatched/cancelled
 *  - Play sound when alert_level appears or escalates
 *  - Show floating alert cards
 *  - Mute / unmute audio
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthBootstrap'
import { playAlert, isMuted, toggleMute } from '../../lib/alertSound'
import { notify, requestNotificationPermission } from '../../lib/notify'
import { shouldAlertNewOrder, isOrderClosed, NEW_ORDER_REPEAT_MS } from '../../lib/newOrderAlert'
import type { Order, Platform } from '../../types'
import { PLATFORM_COLORS, PLATFORM_LABELS_SHORT as PLATFORM_LABELS, effectivePlatform } from '../../lib/platformConfig'
import './AlertSystem.css'

const DISMISS_MS = 7_000

type AlertLevel = 'warning' | 'urgent' | 'overdue'

interface AlertItem {
  uid:            string
  orderId:        string
  orderCode:      string
  platform:       Platform
  source_channel: string | null
  level:          AlertLevel
  message:        string
  createdAt:      number
  dismissing:     boolean
}

interface NewOrderItem {
  orderId:        string
  orderCode:      string
  customerName:   string
  platform:       Platform
  source_channel: string | null
}

function orderCode(order: Order): string {
  return '#' + (order.platform_order_code ?? order.platform_order_id?.slice(0, 8).toUpperCase() ?? '???')
}

// ── New order card (sticky until acknowledged) ───────────────────────────────

function NewOrderCard({ item, onAck }: { item: NewOrderItem; onAck: (orderId: string) => void }) {
  const displayPlatform = effectivePlatform(item)
  const color = PLATFORM_COLORS[displayPlatform]

  return (
    <div
      className="alert-card new-order"
      style={{ '--alert-platform-color': color } as React.CSSProperties}
      onClick={() => onAck(item.orderId)}
      title="Clique para confirmar que viu o pedido"
    >
      <div className="alert-header">
        <div className="alert-platform">
          <span className="alert-platform-dot" style={{ background: color }} />
          <span className="alert-platform-name">{PLATFORM_LABELS[displayPlatform]}</span>
        </div>
        <span className="alert-order-code">{item.orderCode}</span>
        <span className="alert-badge new-order">Novo</span>
      </div>
      <div className="alert-message new-order">{item.customerName}</div>
      <div className="alert-hint">Clique para confirmar</div>
    </div>
  )
}

// ── Alert card ────────────────────────────────────────────────────────────────

function AlertCard({ alert, onDismiss }: { alert: AlertItem; onDismiss: (uid: string) => void }) {
  const displayPlatform = effectivePlatform(alert)
  const color = PLATFORM_COLORS[displayPlatform]
  const elapsed = Date.now() - alert.createdAt
  const pct = Math.max(0, 1 - elapsed / DISMISS_MS)

  const badgeLabel: Record<AlertLevel, string> = { warning: '5 min', urgent: '1 min', overdue: 'Atrasado' }

  return (
    <div
      className={`alert-card ${alert.level} ${alert.dismissing ? 'dismissing' : ''}`}
      style={{ '--alert-platform-color': color } as React.CSSProperties}
      onClick={() => onDismiss(alert.uid)}
    >
      <div className="alert-header">
        <div className="alert-platform">
          <span className="alert-platform-dot" style={{ background: color }} />
          <span className="alert-platform-name">{PLATFORM_LABELS[displayPlatform]}</span>
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
    const handler = (e: Event) => setMuted((e as CustomEvent<{ muted: boolean }>).detail.muted)
    window.addEventListener('alert-mute-changed', handler)
    return () => window.removeEventListener('alert-mute-changed', handler)
  }, [])

  return (
    <button
      onClick={() => toggleMute()}
      title={muted ? 'Sons silenciados — clique para ativar' : 'Silenciar sons de alerta'}
      style={{
        position: 'fixed', bottom: 12, right: 16, zIndex: 9000,
        background: '#111', border: '1px solid #222', borderRadius: 6,
        color: muted ? '#555' : '#aaa', cursor: 'pointer', padding: '5px 8px',
        display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
      }}
    >
      {muted ? (
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      ) : (
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/>
        </svg>
      )}
      {muted ? 'Mudo' : 'Sons'}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AlertSystem() {
  const { storeId, isReady } = useAuth()
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  // Track last known alert_level per order to detect escalation
  const lastLevelRef = useRef<Map<string, AlertLevel>>(new Map())
  const firedRef     = useRef<Set<string>>(new Set())
  const [newOrders, setNewOrders] = useState<NewOrderItem[]>([])
  const seenNewRef = useRef<Set<string>>(new Set())
  const notificationsRef = useRef<Map<string, Notification>>(new Map())
  const hasPendingNewOrders = newOrders.length > 0

  function acknowledgeNewOrder(orderId: string) {
    setNewOrders(prev => prev.filter(o => o.orderId !== orderId))
    notificationsRef.current.get(orderId)?.close()
    notificationsRef.current.delete(orderId)
  }

  function handleOrderInsert(order: Order) {
    if (!shouldAlertNewOrder(order, Date.now())) return
    if (seenNewRef.current.has(order.id)) return
    seenNewRef.current.add(order.id)

    const item: NewOrderItem = {
      orderId:        order.id,
      orderCode:      orderCode(order),
      customerName:   order.customer_name,
      platform:       order.platform,
      source_channel: order.source_channel ?? null,
    }

    playAlert('new_order')
    const n = notify({
      title:   `Novo pedido — ${PLATFORM_LABELS[effectivePlatform(item)]}`,
      body:    `${item.orderCode} · ${item.customerName}`,
      tag:     `new-order-${order.id}`,
      // Muted → no Windows sound either; otherwise it backs up our chime while minimized
      silent:  isMuted(),
      onClick: () => acknowledgeNewOrder(order.id),
    })
    if (n) notificationsRef.current.set(order.id, n)

    setNewOrders(prev => [item, ...prev])
  }

  function dismiss(uid: string) {
    setAlerts(prev => prev.map(a => a.uid === uid ? { ...a, dismissing: true } : a))
    setTimeout(() => setAlerts(prev => prev.filter(a => a.uid !== uid)), 250)
  }

  function handleOrderUpdate(order: Order & { alert_level?: AlertLevel | null }) {
    if (isOrderClosed(order.status)) acknowledgeNewOrder(order.id)

    const level = order.alert_level ?? null
    const prev  = lastLevelRef.current.get(order.id) ?? null

    // Clear cached level if order became terminal
    if (!level) {
      lastLevelRef.current.delete(order.id)
      return
    }

    // Only fire when level is new or escalated
    if (prev === level) return
    lastLevelRef.current.set(order.id, level)

    const key = `${order.id}-${level}`
    if (firedRef.current.has(key)) return
    firedRef.current.add(key)

    const code = orderCode(order)
    const messages: Record<AlertLevel, string> = {
      warning: 'Pedido vai atrasar em 5 minutos!',
      urgent:  'Despachar em menos de 1 minuto!',
      overdue: 'Pedido atrasado!',
    }

    const item: AlertItem = {
      uid:            `${key}-${Date.now()}`,
      orderId:        order.id,
      orderCode:      code,
      platform:       order.platform,
      source_channel: order.source_channel ?? null,
      level,
      message:        messages[level],
      createdAt:      Date.now(),
      dismissing:     false,
    }

    const soundLevel = level === 'warning' ? '5min' : level === 'urgent' ? '1min' : 'critical'
    playAlert(soundLevel)
    notify({
      title: level === 'overdue' ? 'Pedido atrasado' : level === 'urgent' ? 'Despachar agora!' : 'Pedido em 5 min',
      body:  `${code} — ${messages[level]}`,
      tag:   key,
      silent: false,
    })

    setAlerts(prev => [item, ...prev].slice(0, 6))
    setTimeout(() => dismiss(item.uid), DISMISS_MS)
  }

  // Repeat the chime while any new order is unacknowledged (playAlert honours mute)
  useEffect(() => {
    if (!hasPendingNewOrders) return
    const id = setInterval(() => playAlert('new_order'), NEW_ORDER_REPEAT_MS)
    return () => clearInterval(id)
  }, [hasPendingNewOrders])

  useEffect(() => {
    // Runs right after login (AlertSystem mounts with the app shell)
    requestNotificationPermission().catch(() => {})
    if (!isReady || !storeId) return

    const filter = `store_id=eq.${storeId}`
    const channel = supabase
      .channel(`alert-system-${storeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter },
        (payload) => handleOrderInsert(payload.new as Order),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter },
        (payload) => handleOrderUpdate(payload.new as Order & { alert_level?: AlertLevel | null }),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [storeId, isReady]) // eslint-disable-line

  return (
    <>
      <MuteButton />
      {(newOrders.length > 0 || alerts.length > 0) && (
        <div className="alert-container">
          {newOrders.map(item => <NewOrderCard key={item.orderId} item={item} onAck={acknowledgeNewOrder} />)}
          {alerts.map(alert => <AlertCard key={alert.uid} alert={alert} onDismiss={dismiss} />)}
        </div>
      )}
    </>
  )
}
