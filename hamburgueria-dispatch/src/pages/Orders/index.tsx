import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Order, Platform } from '../../types'
import OrderForm from '../../components/OrderForm'
import './Orders.css'

// ── Platform config ──────────────────────────────────────────────────────────

const PLATFORMS: { key: Platform; label: string; color: string }[] = [
  { key: 'ifood',        label: 'iFood',        color: '#EA1D2C' },
  { key: 'keeta',        label: 'Keeta',        color: '#27AE60' },
  { key: '99food',       label: '99Food',       color: '#F5A623' },
  { key: 'cardapio_web', label: 'Cardápio Web', color: '#8B5CF6' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatAddress(order: Order) {
  const parts = [order.address_street, order.address_number].filter(Boolean)
  return parts.join(', ')
}

function fullAddress(order: Order) {
  return [
    order.address_street,
    order.address_number,
    order.address_complement,
    order.address_neighborhood,
    order.address_city,
    order.address_zip,
  ].filter(Boolean).join(', ')
}

const STATUS_LABELS: Record<string, string> = {
  received:         'Recebido',
  normalized:       'Normalizado',
  awaiting_route:   'Ag. rota',
  in_suggestion:    'Em sugestão',
  dispatched:       'Despachado',
  delivered:        'Entregue',
  cancelled:        'Cancelado',
  dispatch_timeout: 'Timeout',
}

const STATUS_CLASS: Record<string, string> = {
  received:         'status-received',
  normalized:       'status-normalized',
  awaiting_route:   'status-awaiting',
  in_suggestion:    'status-in_suggestion',
  dispatched:       'status-dispatched',
  delivered:        'status-delivered',
  cancelled:        'status-cancelled',
  dispatch_timeout: 'status-timeout',
}

const DELIVERY_LABELS: Record<string, string> = {
  delivery: 'Entrega',
  pickup:   'Retirada',
}

const LOGISTICS_LABELS: Record<string, string> = {
  own:      'Motoboy próprio',
  platform: 'Plataforma',
}

// ── OrderCard ────────────────────────────────────────────────────────────────

function OrderCard({ order, color, onClick }: { order: Order; color: string; onClick: () => void }) {
  const code = order.platform_order_code || order.platform_order_id.slice(0, 8).toUpperCase()

  return (
    <div
      className="order-card"
      style={{ '--platform-color': color } as React.CSSProperties}
      onClick={onClick}
    >
      <div className="card-top">
        <span className="card-code">#{code}</span>
        <span className={`card-status ${STATUS_CLASS[order.status] ?? ''}`}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      <div className="card-customer">{order.customer_name}</div>
      <div className="card-address">{formatAddress(order)}</div>

      <div className="card-footer">
        <span className="card-amount">{formatCurrency(order.total_amount)}</span>
        <span className="card-time">{formatTime(order.created_at)}</span>
      </div>
    </div>
  )
}

// ── OrderModal ───────────────────────────────────────────────────────────────

function OrderModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const [visible, setVisible] = useState(false)
  const prevOrder = useRef<Order | null>(null)

  // Track which order to render (keep showing while closing)
  if (order) prevOrder.current = order
  const displayed = order ?? prevOrder.current

  useEffect(() => {
    if (order) {
      // Small delay so CSS transition fires after mount
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [order])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!displayed) return null

  const platform = PLATFORMS.find(p => p.key === displayed.platform)
  const code = displayed.platform_order_code || displayed.platform_order_id.slice(0, 8).toUpperCase()

  return (
    <div className={`modal-overlay ${visible ? 'open' : ''}`} onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span
              className="modal-platform-badge"
              style={{ color: platform?.color }}
            >
              <span className="badge-dot" style={{ background: platform?.color }} />
              {platform?.label ?? displayed.platform}
            </span>
            <span className="modal-order-code">#{code}</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="13" y2="13"/>
              <line x1="13" y1="1" x2="1" y2="13"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">

          {/* Status + tipo */}
          <div className="modal-section">
            <span className="modal-section-title">Status</span>
            <div className="modal-row">
              <span className="modal-row-label">Situação</span>
              <span className={`modal-status-badge ${STATUS_CLASS[displayed.status] ?? ''}`}>
                {STATUS_LABELS[displayed.status] ?? displayed.status}
              </span>
            </div>
            <div className="modal-row">
              <span className="modal-row-label">Tipo</span>
              <span className="modal-row-value">{DELIVERY_LABELS[displayed.delivery_type] ?? displayed.delivery_type}</span>
            </div>
            <div className="modal-row">
              <span className="modal-row-label">Logística</span>
              <span className="modal-row-value">{LOGISTICS_LABELS[displayed.logistics_type] ?? displayed.logistics_type}</span>
            </div>
          </div>

          {/* Cliente */}
          <div className="modal-section">
            <span className="modal-section-title">Cliente</span>
            <div className="modal-row">
              <span className="modal-row-label">Nome</span>
              <span className="modal-row-value">{displayed.customer_name}</span>
            </div>
            {displayed.customer_phone && (
              <div className="modal-row">
                <span className="modal-row-label">Telefone</span>
                <span className="modal-row-value">{displayed.customer_phone}</span>
              </div>
            )}
          </div>

          {/* Endereço */}
          <div className="modal-section">
            <span className="modal-section-title">Endereço</span>
            <div className="modal-row">
              <span className="modal-row-label">Endereço</span>
              <span className="modal-row-value">{fullAddress(displayed)}</span>
            </div>
          </div>

          {/* Itens */}
          {displayed.items?.length > 0 && (
            <div className="modal-section">
              <span className="modal-section-title">Itens do pedido</span>
              <div className="modal-items-list">
                {displayed.items.map((item, i) => (
                  <div key={i} className="modal-item">
                    <div style={{ flex: 1 }}>
                      <div className="modal-item-name">{item.name}</div>
                      {item.notes && <div className="modal-item-notes">{item.notes}</div>}
                    </div>
                    <span className="modal-item-qty">×{item.quantity}</span>
                    <span className="modal-item-price">{formatCurrency(item.total_price)}</span>
                  </div>
                ))}
                <div className="modal-total-row">
                  <span className="modal-total-label">Total</span>
                  <span className="modal-total-value">{formatCurrency(displayed.total_amount)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Pagamento */}
          <div className="modal-section">
            <span className="modal-section-title">Pagamento</span>
            <div className="modal-row">
              <span className="modal-row-label">Forma</span>
              <span className="modal-row-value">{displayed.payment_method ?? '—'}</span>
            </div>
            <div className="modal-row">
              <span className="modal-row-label">Total</span>
              <span className="modal-row-value" style={{ fontWeight: 700, color: '#fff' }}>
                {formatCurrency(displayed.total_amount)}
              </span>
            </div>
          </div>

          {/* Timestamps */}
          <div className="modal-section">
            <span className="modal-section-title">Horários</span>
            <div className="modal-row">
              <span className="modal-row-label">Recebido</span>
              <span className="modal-row-value">{new Date(displayed.created_at).toLocaleString('pt-BR')}</span>
            </div>
            {displayed.dispatched_at && (
              <div className="modal-row">
                <span className="modal-row-label">Despachado</span>
                <span className="modal-row-value">{new Date(displayed.dispatched_at).toLocaleString('pt-BR')}</span>
              </div>
            )}
            {displayed.estimated_delivery_at && (
              <div className="modal-row">
                <span className="modal-row-label">Prev. entrega</span>
                <span className="modal-row-value">{new Date(displayed.estimated_delivery_at).toLocaleString('pt-BR')}</span>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  async function fetchOrders() {
    setRefreshing(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .not('status', 'in', '("delivered","cancelled")')
      .order('created_at', { ascending: false })

    if (error) {
      setError('Erro ao carregar pedidos: ' + error.message)
    } else {
      setOrders(data as Order[])
      setError(null)
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    fetchOrders()

    // Real-time subscription
    const channel = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const ordersByPlatform = (platform: Platform) =>
    orders.filter(o => o.platform === platform)

  if (loading) return <div className="orders-panel"><div className="orders-loading">Carregando pedidos...</div></div>
  if (error)   return <div className="orders-panel"><div className="orders-error">{error}</div></div>

  return (
    <div className="orders-panel">
      <div className="orders-header">
        <h1>Painel de Pedidos</h1>
        <div className="orders-header-actions">
          <button
            className={`orders-refresh-btn ${refreshing ? 'spinning' : ''}`}
            onClick={fetchOrders}
            disabled={refreshing}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Atualizar
          </button>
          <button
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', background: '#fff', border: 'none',
              borderRadius: 6, color: '#000', fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
            }}
            onClick={() => setFormOpen(true)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Novo pedido
          </button>
        </div>
      </div>

      <div className="orders-columns">
        {PLATFORMS.map(platform => {
          const cols = ordersByPlatform(platform.key)
          return (
            <div key={platform.key} className="orders-column">
              <div className="column-header" style={{ borderBottom: `2px solid ${platform.color}22` }}>
                <div className="column-title">
                  <span className="column-dot" style={{ background: platform.color }} />
                  <span style={{ color: platform.color }}>{platform.label}</span>
                </div>
                <span className="column-count">{cols.length}</span>
              </div>

              <div className="column-body">
                {cols.length === 0 ? (
                  <div className="column-empty">Sem pedidos</div>
                ) : (
                  cols.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      color={platform.color}
                      onClick={() => setSelectedOrder(order)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />

      <OrderForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={fetchOrders}
      />
    </div>
  )
}
