import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/auth/AuthBootstrap'
import { confirmIfoodDispatch } from '../../lib/integrations/ifood'
import { confirmOpenDeliveryDispatch } from '../../lib/integrations/openDelivery'
import { fetchRouteGeometry, findOptimalSequence } from '../../lib/routeEngine'
import { logOrderEvent } from '../../lib/orderEvents'
import type { Driver, Order, Platform, Store } from '../../types'
import { PLATFORM_COLORS } from '../../lib/platformConfig'
import OperationalMap, { DISPATCH_GHOST_MS } from './OperationalMap'
import type { HighlightFinalized, OrderMarkerState } from './OperationalMap'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import './Operational.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const MARKER_STATUS_COLORS = {
  outsideSuggestion:  'rgba(148, 163, 184, 0.38)',
  pendingSuggestion:  'rgba(96, 165, 250, 0.42)',
  selectedSuggestion: 'rgba(250, 204, 21, 0.5)',
  recentlyDispatched: 'rgba(74, 222, 128, 0.42)',
  ghost:              'rgba(255, 255, 255, 0.14)',
  driverFocus:        '#22d3ee',
} as const

// ── Local types ───────────────────────────────────────────────────────────────

interface SuggestionRow {
  id: string
  store_id: string
  assigned_driver_id: string | null
  status: string
  suggested_sequence: string[]
  predicted_eta: number | null
  suggestion_version: number
  created_at: string
  orders: Order[]
}

interface InProgressEntry {
  suggestionId: string
  suggestionShortId: string
  orderIds: string[]
  dispatchedAt: number  // Date.now()
  driverName: string
  predictedEta: number | null
  stopCount: number
}

interface FinalizedEntry {
  id: string
  code: string
  driverId: string | null
  customerName: string
  driverName: string | null
  status: string
  totalAmount: number
  platform: Platform
  dispatchedAt: string | null
  latitude: number | null
  longitude: number | null
  addressStreet:       string | null
  addressNumber:       string | null
  addressNeighborhood: string | null
  addressCity:         string | null
  addressZip:          string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function shortAddress(o: Order) {
  return [o.address_street, o.address_number, o.address_neighborhood]
    .filter(Boolean).join(', ')
}

// ── Countdown timer ───────────────────────────────────────────────────────────

function CountdownTimer({
  startedAt,
  etaMinutes,
}: {
  startedAt: number
  etaMinutes: number | null
}) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const totalMs   = (etaMinutes ?? 30) * 60_000
  const remaining = Math.max(0, totalMs - (now - startedAt))
  const mins      = Math.floor(remaining / 60_000)
  const secs      = Math.floor((remaining % 60_000) / 1000)

  const cls =
    remaining < 60_000    ? 'inprog-countdown urgent'  :
    remaining < 300_000   ? 'inprog-countdown warning' :
    'inprog-countdown'

  return (
    <span className={cls}>
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  )
}

// ── SuggestionBlock ───────────────────────────────────────────────────────────

interface SuggestionBlockProps {
  suggestion:     SuggestionRow
  drivers:        Driver[]
  isSelected:     boolean
  driverValue:    string
  loading:        boolean
  onSelect:       () => void
  onDriverChange: (id: string) => void
  onAccept:       () => void
  onReject:       () => void
  onEdit:         () => void
}

function SuggestionBlock({
  suggestion, drivers, isSelected, driverValue, loading,
  onSelect, onDriverChange, onAccept, onReject, onEdit,
}: SuggestionBlockProps) {
  const total = suggestion.orders.reduce((s, o) => s + o.total_amount, 0)
  const shortId = suggestion.id.slice(0, 8).toUpperCase()
  const canAccept = !!driverValue && !loading

  return (
    <div
      className={`sug-block ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="sug-header">
        <div className="sug-header-left">
          <span className="sug-id">#{shortId}</span>
          <span className="sug-version">v{suggestion.suggestion_version}</span>
        </div>
        <div className="sug-header-right">
          <span className="sug-eta">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {suggestion.predicted_eta != null
              ? `${suggestion.predicted_eta} min`
              : `~${suggestion.orders.length * 15} min`
            }
          </span>
          <span className="sug-stops-badge">
            {suggestion.orders.length} {suggestion.orders.length === 1 ? 'parada' : 'paradas'}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#bbb' }}>
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      {/* Stops */}
      <div className="sug-stops">
        {suggestion.orders.map((order, idx) => (
          <div key={order.id} className="sug-stop">
            <span className="sug-stop-num">{idx + 1}</span>
            <span className="sug-stop-dot" style={{ background: PLATFORM_COLORS[order.platform] }} />
            <div className="sug-stop-info">
              <div className="sug-stop-customer">{order.customer_name}</div>
              <div className="sug-stop-address">{shortAddress(order)}</div>
            </div>
            <span className="sug-stop-amount">{formatCurrency(order.total_amount)}</span>
          </div>
        ))}
      </div>

      {/* Footer: driver select + actions */}
      <div className="sug-footer" onClick={e => e.stopPropagation()}>
        <select
          className={`sug-driver-select ${!driverValue ? 'unset' : ''}`}
          value={driverValue}
          onChange={e => onDriverChange(e.target.value)}
        >
          <option value="">Selecionar motoboy *</option>
          {drivers.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <div className="sug-actions">
          <button
            className="btn-sug-reject"
            disabled={loading}
            onClick={onReject}
          >
            Recusar
          </button>
          <button
            className="btn-sug-edit"
            disabled={loading}
            onClick={e => { e.stopPropagation(); onEdit() }}
          >
            Editar
          </button>
          <button
            className="btn-sug-accept"
            disabled={!canAccept}
            onClick={onAccept}
            title={!driverValue ? 'Selecione um motoboy para aceitar' : ''}
          >
            {loading ? (
              'Aguarde...'
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Aceitar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── InProgressBlock ───────────────────────────────────────────────────────────

function InProgressBlock({ entry }: { entry: InProgressEntry }) {
  return (
    <div className="inprog-block">
      <div className="inprog-left">
        <span className="inprog-id">#{entry.suggestionShortId}</span>
        <span className="inprog-driver">{entry.driverName}</span>
        <span className="inprog-stops">
          {entry.stopCount} {entry.stopCount === 1 ? 'entrega' : 'entregas'}
        </span>
      </div>
      <div className="inprog-right">
        <CountdownTimer startedAt={entry.dispatchedAt} etaMinutes={entry.predictedEta} />
        <span className="inprog-label">restante</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Operational() {
  const [store, setStore]                 = useState<Store | null>(null)
  const [orders, setOrders]               = useState<Order[]>([])
  const [suggestions, setSuggestions]     = useState<SuggestionRow[]>([])
  const [drivers, setDrivers]             = useState<Driver[]>([])
  const [selectedSuggId, setSelectedSuggId]           = useState<string | null>(null)
  const [selectedFinalizedId, setSelectedFinalizedId] = useState<string | null>(null)
  const [geocodingId, setGeocodingId]                 = useState<string | null>(null)
  const [geocodedCoords, setGeocodedCoords]           = useState<Record<string, [number, number]>>({})
  const [activeTab, setActiveTab]                     = useState<'suggestions' | 'inprogress' | 'finalized'>('suggestions')
  const [finalized, setFinalized]         = useState<FinalizedEntry[]>([])
  const [driverSelections, setDriverSelections] = useState<Record<string, string>>({})
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [driverFilterOpen, setDriverFilterOpen] = useState(false)
  const [orderDriverMap, setOrderDriverMap] = useState<Record<string, string>>({})
  const [inProgress, setInProgress]       = useState<InProgressEntry[]>([])
  const [loadingAction, setLoadingAction] = useState<string | null>(null) // suggestionId being acted upon
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false)
  const [editingSuggId, setEditingSuggId] = useState<string | null>(null)
  const [loading, setLoading]             = useState(true)
  const [popupOrderId, setPopupOrderId]   = useState<string | null>(null)
  const { storeId, isReady }              = useAuth()
  const driverFilterRef                   = useRef<HTMLDivElement | null>(null)
  // Monotonic generation counter — guards enrichment race: only the last
  // fetchAll() caller is allowed to commit state. Stale replies drop silently.
  const fetchGenRef                       = useRef(0)
  const [tick, setTick]                   = useState(0)

  // Event-driven tick: only schedule a re-render at the exact moment an order
  // transitions from "recently dispatched" to "ghost". Previously ran every
  // 1s regardless of state, costing 60 renders/min even when nothing changed.
  useEffect(() => {
    const now = Date.now()
    const upcomingTransitions = orders
      .filter(o => o.status === 'dispatched' && o.dispatched_at)
      .map(o => new Date(o.dispatched_at!).getTime() + DISPATCH_GHOST_MS)
      .filter(t => t > now)
    if (upcomingTransitions.length === 0) return
    const soonest = Math.min(...upcomingTransitions)
    const delay = Math.max(soonest - now, 100)
    const id = setTimeout(() => setTick(t => t + 1), delay)
    return () => clearTimeout(id)
  }, [orders, tick])

  // Ghost cleanup: remove in-progress entries older than DISPATCH_GHOST_MS
  useEffect(() => {
    const now = Date.now()
    const hasExpired = inProgress.some(e => now - e.dispatchedAt >= DISPATCH_GHOST_MS)
    if (hasExpired) {
      setInProgress(prev => prev.filter(e => Date.now() - e.dispatchedAt < DISPATCH_GHOST_MS))
    }
  }, [tick]) // eslint-disable-line

  useEffect(() => {
    if (!driverFilterOpen) return
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (driverFilterRef.current && !driverFilterRef.current.contains(target)) {
        setDriverFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [driverFilterOpen])

  // ── Data fetching ───────────────────────────────────────────────────────────

  async function fetchAll() {
    if (!storeId) { setLoading(false); return }
    const sid = storeId
    const myGen = ++fetchGenRef.current

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [storeRes, driversRes, ordersRes, suggestionsRes, finalizedRes] = await Promise.all([
      supabase.from('stores').select('*').eq('id', sid).single(),
      supabase.from('drivers').select('*').eq('store_id', sid).eq('active', true).order('name'),
      supabase.from('orders').select('*')
        .eq('store_id', sid)
        .not('status', 'in', '("delivered","cancelled")')
        .order('rejection_count', { ascending: false })
        .order('created_at', { ascending: false }),
      // Single-query JOIN: suggestions + their orders via the FK
      // dispatch_suggestion_orders.suggestion_id. Cuts 2 round-trips.
      supabase.from('dispatch_suggestions')
        .select('*, dispatch_suggestion_orders(position, order:orders(*))')
        .eq('store_id', sid)
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false }),
      supabase.from('orders').select('*')
        .eq('store_id', sid)
        .in('status', ['dispatched', 'delivered', 'cancelled'])
        .gte('updated_at', since24h)
        .order('updated_at', { ascending: false })
        .limit(100),
    ])

    const fetchedOrders  = (ordersRes.data ?? []) as Order[]
    const rawSuggestions = (suggestionsRes.data ?? []) as Array<
      Record<string, unknown> & {
        suggested_sequence: string[]
        dispatch_suggestion_orders?: Array<{ position: number; order: Order | null }>
      }
    >

    // Build per-suggestion order lookup from the embedded JOIN. Falls back
    // to an empty list if FK embed returned nothing (keeps render safe).
    const enriched: SuggestionRow[] = rawSuggestions.map(s => {
      const joined = s.dispatch_suggestion_orders ?? []
      const byId = new Map<string, Order>()
      for (const row of joined) {
        if (row.order) byId.set(row.order.id, row.order)
      }
      const ordered = (s.suggested_sequence ?? [])
        .map(id => byId.get(id))
        .filter(Boolean) as Order[]
      // Drop the embedded join field from the row we surface to UI
      const { dispatch_suggestion_orders: _omit, ...rest } = s
      return { ...(rest as Record<string, unknown>), orders: ordered } as SuggestionRow
    })

    // ── Driver by order map (for finalized list + map highlight) ───────────
    const finalizedOrders = (finalizedRes.data ?? []) as Order[]
    const allRelevantOrderIds = [
      ...new Set([...fetchedOrders, ...finalizedOrders].map(o => o.id)),
    ]
    const driverIdByOrderId: Record<string, string> = {}
    const driverNameByOrderId: Record<string, string> = {}

    if (allRelevantOrderIds.length > 0) {
      const { data: suggLinks } = await supabase
        .from('dispatch_suggestion_orders')
        .select('order_id, suggestion_id')
        .in('order_id', allRelevantOrderIds)

      if (suggLinks?.length) {
        const suggIds = [...new Set(suggLinks.map(l => l.suggestion_id as string))]
        const { data: dispatched } = await supabase
          .from('dispatch_suggestions')
          .select('id, assigned_driver_id')
          .in('id', suggIds)
          .not('assigned_driver_id', 'is', null)

        const suggToDriver = new Map((dispatched ?? []).map(s => [s.id, s.assigned_driver_id as string]))
        const allDriverIds = [...new Set((dispatched ?? []).map(s => s.assigned_driver_id as string))]
        const driverNameMap = new Map<string, string>()

        if (allDriverIds.length > 0) {
          const { data: driverRows } = await supabase
            .from('drivers')
            .select('id, name')
            .in('id', allDriverIds)
          for (const d of (driverRows ?? [])) {
            driverNameMap.set(d.id, d.name)
          }
        }

        for (const link of suggLinks) {
          const driverId = suggToDriver.get(link.suggestion_id)
          if (!driverId) continue
          driverIdByOrderId[link.order_id] = driverId
          if (driverNameMap.has(driverId)) {
            driverNameByOrderId[link.order_id] = driverNameMap.get(driverId)!
          }
        }
      }
    }

    const finalizedEntries: FinalizedEntry[] = finalizedOrders.map(o => ({
      id:          o.id,
      code:        o.platform_order_code ?? `#${o.id.slice(0, 6).toUpperCase()}`,
      driverId:    driverIdByOrderId[o.id] ?? null,
      customerName: o.customer_name,
      driverName:  driverNameByOrderId[o.id] ?? null,
      status:      o.status,
      totalAmount: o.total_amount,
      platform:    o.platform,
      dispatchedAt: o.dispatched_at ?? null,
      latitude:    o.latitude ?? null,
      longitude:   o.longitude ?? null,
      addressStreet:       o.address_street ?? null,
      addressNumber:       o.address_number ?? null,
      addressNeighborhood: o.address_neighborhood ?? null,
      addressCity:         o.address_city ?? null,
      addressZip:          o.address_zip ?? null,
    }))

    // Race guard: a newer fetchAll() started after us — its result will be
    // the truth. Drop our stale snapshot to avoid flicker / wrong sequence.
    if (myGen !== fetchGenRef.current) return

    setStore((storeRes.data ?? null) as Store | null)
    setDrivers((driversRes.data ?? []) as Driver[])
    setOrders(fetchedOrders)
    setSuggestions(enriched)
    setOrderDriverMap(driverIdByOrderId)
    setFinalized(finalizedEntries)
    setLoading(false)
  }

  async function geocodeEntry(entry: FinalizedEntry): Promise<[number, number] | null> {
    const queries: string[] = []
    if (entry.addressZip) {
      queries.push(`${entry.addressZip}, Brasil`)
    }
    const parts = [entry.addressStreet, entry.addressNumber, entry.addressNeighborhood, entry.addressCity]
      .filter(Boolean)
    if (parts.length >= 2) {
      queries.push(`${parts.join(', ')}, Brasil`)
    }
    for (const q of queries) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br`,
          { headers: { 'Accept': 'application/json' } },
        )
        const data = await res.json()
        if (data?.[0]?.lat && data?.[0]?.lon) {
          return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
        }
      } catch { /* try next query */ }
    }
    return null
  }

  async function handleFinalizedClick(entry: FinalizedEntry) {
    if (selectedFinalizedId === entry.id) {
      setSelectedFinalizedId(null)
      return
    }
    const cached = geocodedCoords[entry.id]
    if ((entry.latitude != null && entry.longitude != null) || cached) {
      setSelectedFinalizedId(entry.id)
      return
    }
    setGeocodingId(entry.id)
    const coord = await geocodeEntry(entry)
    setGeocodingId(null)
    if (coord) {
      setGeocodedCoords(prev => ({ ...prev, [entry.id]: coord }))
      setSelectedFinalizedId(entry.id)
    }
  }

  useEffect(() => {
    if (!isReady || !storeId) return
    fetchAll()

    // Coalesce realtime bursts: many postgres_changes events arriving in a
    // short window trigger only ONE fetchAll. Prevents rebuilding state 5+
    // times in a row when a suggestion touches orders + suggestions + drivers.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let inFlight = false
    let pendingWhileInFlight = false

    async function scheduleFetch() {
      if (inFlight) {
        pendingWhileInFlight = true
        return
      }
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        inFlight = true
        try {
          await fetchAll()
        } finally {
          inFlight = false
          if (pendingWhileInFlight) {
            pendingWhileInFlight = false
            scheduleFetch()
          }
        }
      }, 300)
    }

    const channel = supabase
      .channel('op-main')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_suggestions' }, scheduleFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, scheduleFetch)
      .subscribe()

    // Poll fallback: refreshes panel even when Realtime events don't fire
    // (Supabase requires REPLICA IDENTITY FULL for reliable change events)
    const pollTimer = setInterval(fetchAll, 10_000)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
      clearInterval(pollTimer)
    }
  }, [storeId, isReady]) // eslint-disable-line

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleAccept(suggestion: SuggestionRow) {
    const driverId = driverSelections[suggestion.id]
    if (!driverId) return

    const driver = drivers.find(d => d.id === driverId)
    const now    = new Date().toISOString()
    const orderIds = suggestion.orders.map(o => o.id)

    setLoadingAction(suggestion.id)

    await Promise.all([
      supabase.from('dispatch_suggestions').update({
        status: 'dispatched',
        assigned_driver_id: driverId,
        reviewed_at: now,
      }).eq('id', suggestion.id),
      supabase.from('orders').update({
        status: 'dispatched',
        dispatched_at: now,
      }).in('id', orderIds),
    ])

    // Audit: one 'dispatched' event per order
    for (const order of suggestion.orders) {
      logOrderEvent({
        orderId:   order.id,
        storeId:   order.store_id,
        eventType: 'dispatched',
        actorType: 'operator',
        previous:  { status: order.status },
        next:      { status: 'dispatched', dispatched_at: now },
        metadata: {
          suggestion_id: suggestion.id,
          driver_id:     driverId,
          driver_name:   driver?.name ?? null,
          stop_count:    suggestion.orders.length,
        },
      })
    }

    // Notify platforms — best-effort, never block the UI on failure
    for (const order of suggestion.orders) {
      if (order.platform === 'ifood') {
        confirmIfoodDispatch(order.platform_order_id).catch(e =>
          console.warn('[Dispatch] iFood confirm failed:', e),
        )
      } else if (order.platform === '99food' || order.platform === 'cardapio_web') {
        confirmOpenDeliveryDispatch(order.platform, order.platform_order_id).catch(e =>
          console.warn(`[Dispatch] ${order.platform} confirm failed:`, e),
        )
        // keeta: always platform-managed logistics, never reaches dispatch queue
      }
    }

    // Add to in-progress tab
    setInProgress(prev => [...prev, {
      suggestionId:    suggestion.id,
      suggestionShortId: suggestion.id.slice(0, 8).toUpperCase(),
      orderIds,
      dispatchedAt:    Date.now(),
      driverName:      driver?.name ?? 'Motorista',
      predictedEta:    suggestion.predicted_eta,
      stopCount:       suggestion.orders.length,
    }])

    setActiveTab('inprogress')
    if (selectedSuggId === suggestion.id) setSelectedSuggId(null)
    setLoadingAction(null)
    await fetchAll()
  }

  function handleBulkReject() {
    if (suggestions.length < 2) return
    setBulkRejectOpen(true)
  }

  async function confirmBulkReject() {
    setBulkRejectOpen(false)
    setLoadingAction('__bulk__')
    for (const s of suggestions) {
      // reuse single handler to keep audit/logic consistent
      await handleReject(s, true)
    }
    setLoadingAction(null)
    await fetchAll()
  }

  async function handleReject(suggestion: SuggestionRow, skipRefresh = false) {
    const now = new Date().toISOString()
    if (!skipRefresh) setLoadingAction(suggestion.id)

    await supabase.from('dispatch_suggestions').update({
      status: 'rejected',
      reviewed_at: now,
    }).eq('id', suggestion.id)

    // Re-queue orders with incremented rejection_count → higher priority
    for (const order of suggestion.orders) {
      await supabase.from('orders').update({
        status:          'awaiting_route',
        rejection_count: (order.rejection_count ?? 0) + 1,
      }).eq('id', order.id)

      logOrderEvent({
        orderId:   order.id,
        storeId:   order.store_id,
        eventType: 'rejected',
        actorType: 'operator',
        previous:  { status: order.status, rejection_count: order.rejection_count ?? 0 },
        next:      { status: 'awaiting_route', rejection_count: (order.rejection_count ?? 0) + 1 },
        metadata:  { suggestion_id: suggestion.id },
      })
    }

    if (selectedSuggId === suggestion.id) setSelectedSuggId(null)
    if (!skipRefresh) {
      setLoadingAction(null)
      await fetchAll()
    }
  }

  async function handleEditSave(suggestionId: string, newSequence: Order[]) {
    const suggestion = suggestions.find(s => s.id === suggestionId)
    if (!suggestion) return

    const oldIds = new Set(suggestion.orders.map(o => o.id))
    const newIds = new Set(newSequence.map(o => o.id))

    // Orders removed from this suggestion → back to awaiting_route with priority boost
    const removedOrders = suggestion.orders.filter(o => !newIds.has(o.id))

    // Orders added that were in_suggestion in another pending suggestion → steal them
    const addedOrders = newSequence.filter(o => !oldIds.has(o.id))
    for (const addedOrder of addedOrders) {
      const otherSugg = suggestions.find(
        s => s.id !== suggestionId && s.orders.some(o => o.id === addedOrder.id),
      )
      if (otherSugg) {
        const remaining = otherSugg.orders.filter(o => o.id !== addedOrder.id)
        await supabase.from('dispatch_suggestions').update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
        }).eq('id', otherSugg.id)
        for (const o of remaining) {
          await supabase.from('orders').update({
            status: 'awaiting_route',
            rejection_count: (o.rejection_count ?? 0) + 1,
          }).eq('id', o.id)
        }
      }
    }

    // Return removed orders to the queue with priority boost
    for (const o of removedOrders) {
      await supabase.from('orders').update({
        status: 'awaiting_route',
        rejection_count: (o.rejection_count ?? 0) + 1,
      }).eq('id', o.id)
    }

    // Mark all orders in the new sequence as in_suggestion
    if (newSequence.length > 0) {
      await supabase.from('orders').update({ status: 'in_suggestion' })
        .in('id', newSequence.map(o => o.id))
    }

    // Recalculate ETA via OSRM for the new sequence
    let newEta: number | null = null
    const storeCoord = store?.latitude != null && store?.longitude != null
      ? [store.latitude, store.longitude] as [number, number]
      : null
    if (storeCoord && newSequence.every(o => o.latitude != null && o.longitude != null)) {
      try {
        const { durationSeconds } = await findOptimalSequence(storeCoord, newSequence)
        newEta = durationSeconds ? Math.round(durationSeconds / 60) : null
      } catch {
        newEta = null
      }
    }

    // Update the suggestion with new sequence, bumped version and recalculated ETA
    await supabase.from('dispatch_suggestions').update({
      suggested_sequence: newSequence.map(o => o.id),
      suggestion_version: (suggestion.suggestion_version ?? 1) + 1,
      predicted_eta: newEta,
    }).eq('id', suggestionId)

    setEditingSuggId(null)
    await fetchAll()
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const selectedSuggestion   = suggestions.find(s => s.id === selectedSuggId) ?? null
  const selectedSequence     = selectedSuggestion?.suggested_sequence ?? []
  const allSuggestionOrderIds = useMemo(
    () => new Set(suggestions.flatMap(s => s.suggested_sequence)),
    [suggestions],
  )

  useEffect(() => {
    if (!selectedDriverId) return
    if (!drivers.some(d => d.id === selectedDriverId)) {
      setSelectedDriverId(null)
    }
  }, [drivers, selectedDriverId])

  // Derived data for edit modal
  const editingSuggestion = useMemo(
    () => suggestions.find(s => s.id === editingSuggId) ?? null,
    [suggestions, editingSuggId],
  )
  const editingOtherSuggestions = useMemo(
    () => suggestions.filter(s => s.id !== editingSuggId),
    [suggestions, editingSuggId],
  )
  const editingAvailable = useMemo(() => {
    if (!editingSuggId) return []
    const currentEditIds = new Set(editingSuggestion?.suggested_sequence ?? [])
    const otherSuggOrderIds = new Set(
      editingOtherSuggestions.flatMap(s => s.suggested_sequence),
    )
    return orders.filter(
      o =>
        (o.status === 'awaiting_route' && !currentEditIds.has(o.id)) ||
        (o.status === 'in_suggestion' && otherSuggOrderIds.has(o.id) && !currentEditIds.has(o.id)),
    )
  }, [editingSuggId, editingSuggestion, editingOtherSuggestions, orders])

  // Route polyline: straight-line coords (used as fallback while OSRM loads)
  const routeCoords = useMemo<[number, number][]>(() => {
    if (!selectedSuggestion) return []
    const coords: [number, number][] = []
    if (store?.latitude != null && store?.longitude != null) {
      coords.push([store.latitude, store.longitude])
    }
    for (const orderId of selectedSequence) {
      const order = orders.find(o => o.id === orderId)
        ?? selectedSuggestion.orders.find(o => o.id === orderId)
      if (order?.latitude != null && order?.longitude != null) {
        coords.push([order.latitude, order.longitude])
      }
    }
    return coords
  }, [selectedSuggestion, selectedSequence, store, orders])

  // Real road geometry fetched from OSRM (replaces straight lines once loaded)
  const [geoRouteCoords, setGeoRouteCoords] = useState<[number, number][]>([])

  useEffect(() => {
    setGeoRouteCoords([])           // clear previous geometry immediately
    if (routeCoords.length < 2) return

    fetchRouteGeometry(routeCoords)
      .then(setGeoRouteCoords)
      .catch(() => {})              // keep empty → falls back to routeCoords in map
  }, [selectedSuggId])             // eslint-disable-line

  // Marker states (recomputed every tick for live dispatched→ghost transition)
  const markerStates = useMemo<Map<string, OrderMarkerState>>(() => {
    const map = new Map<string, OrderMarkerState>()
    const now = Date.now()

    for (const order of orders) {
      const platformColor = PLATFORM_COLORS[order.platform] ?? '#666677'
      let state: OrderMarkerState

      // Border always follows platform, fill always follows current status.
      if (order.status === 'dispatched') {
        if (order.dispatched_at) {
          const elapsed = now - new Date(order.dispatched_at).getTime()
          if (elapsed < DISPATCH_GHOST_MS) {
            state = {
              borderColor: platformColor,
              fillColor: MARKER_STATUS_COLORS.recentlyDispatched,
              opacity: 1,
              label: '',
              dashed: false,
            }
          } else {
            state = {
              borderColor: platformColor,
              fillColor: MARKER_STATUS_COLORS.ghost,
              opacity: 0.35,
              label: '',
              dashed: true,
            }
          }
        } else {
          state = {
            borderColor: platformColor,
            fillColor: MARKER_STATUS_COLORS.ghost,
            opacity: 0.35,
            label: '',
            dashed: true,
          }
        }
      } else {
        const seqIdx = selectedSequence.indexOf(order.id)
        if (seqIdx >= 0) {
          state = {
            borderColor: platformColor,
            fillColor: MARKER_STATUS_COLORS.selectedSuggestion,
            opacity: 1,
            label: String(seqIdx + 1),
            dashed: false,
          }
        } else if (allSuggestionOrderIds.has(order.id)) {
          state = {
            borderColor: platformColor,
            fillColor: MARKER_STATUS_COLORS.pendingSuggestion,
            opacity: 1,
            label: '',
            dashed: false,
          }
        } else {
          state = {
            borderColor: platformColor,
            fillColor: MARKER_STATUS_COLORS.outsideSuggestion,
            opacity: 1,
            label: '',
            dashed: false,
          }
        }
      }

      // Optional visual focus by selected driver
      if (selectedDriverId) {
        const assignedDriver = orderDriverMap[order.id] ?? null
        if (assignedDriver === selectedDriverId) {
          state = {
            ...state,
            opacity: 1,
          }
        } else {
          state = {
            ...state,
            opacity: Math.min(state.opacity, assignedDriver ? 0.35 : 0.22),
          }
        }
      }

      map.set(order.id, state)
    }

    return map
  }, [orders, selectedSequence, allSuggestionOrderIds, tick, selectedDriverId, orderDriverMap]) // eslint-disable-line

  const popupOrder = orders.find(o => o.id === popupOrderId) ?? null

  // Stats
  const waitingCount    = orders.filter(o => ['awaiting_route', 'normalized', 'received'].includes(o.status)).length
  const dispatchedCount = orders.filter(o => o.status === 'dispatched').length
  const selectedDriverName = selectedDriverId
    ? (drivers.find(d => d.id === selectedDriverId)?.name ?? 'Motoboy')
    : 'Todos'
  const selectedDriverOrderCount = selectedDriverId
    ? Object.values(orderDriverMap).filter(id => id === selectedDriverId).length
    : 0

  const driverHighlightMarkers = useMemo<HighlightFinalized[]>(() => {
    if (!selectedDriverId) return []
    return finalized
      .filter(entry => entry.driverId === selectedDriverId)
      .map(entry => {
        const coord: [number, number] | null =
          entry.latitude != null && entry.longitude != null
            ? [entry.latitude, entry.longitude]
            : geocodedCoords[entry.id] ?? null
        return coord
          ? { coord, code: entry.code, platformColor: PLATFORM_COLORS[entry.platform] ?? '#666677' }
          : null
      })
      .filter(Boolean) as HighlightFinalized[]
  }, [selectedDriverId, finalized, geocodedCoords])

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="op-panel"><div className="op-loading">Carregando painel...</div></div>
  )

  const missingCoords = store != null && (store.latitude == null || store.longitude == null)

  return (
    <div className="op-panel">
      {/* Missing coordinates banner */}
      {missingCoords && (
        <div style={{
          background: 'rgba(251,146,60,0.12)',
          border: '1px solid rgba(251,146,60,0.4)',
          color: '#fb923c',
          padding: '10px 20px',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>
            <strong>Localização da loja não configurada.</strong>{' '}
            Acesse <strong>Configurações</strong> (ícone de engrenagem na sidebar) para definir latitude e longitude.
          </span>
        </div>
      )}

      {/* Stats header */}
      <div className="op-header">
        <h1>Painel Operacional</h1>
        <div className="op-stats">
          <div className="op-stat">
            <span className="op-stat-dot" style={{ background: '#facc15' }} />
            <span className="op-stat-val">{waitingCount}</span>
            <span className="op-stat-lbl">Ag. rota</span>
          </div>
          <div className="op-stat">
            <span className="op-stat-dot" style={{ background: '#fb923c' }} />
            <span className="op-stat-val">{suggestions.length}</span>
            <span className="op-stat-lbl">Sugestões</span>
          </div>
          <div className="op-stat">
            <span className="op-stat-dot" style={{ background: '#4ade80' }} />
            <span className="op-stat-val">{dispatchedCount}</span>
            <span className="op-stat-lbl">Despachados</span>
          </div>
          <div className={`op-driver-filter ${driverFilterOpen ? 'open' : ''}`} ref={driverFilterRef}>
            <button
              className="op-stat op-stat-driver-btn"
              onClick={() => setDriverFilterOpen(prev => !prev)}
              type="button"
            >
              <span className="op-stat-dot" style={{ background: '#60a5fa' }} />
              <span className="op-stat-val">{selectedDriverId ? selectedDriverOrderCount : drivers.length}</span>
              <span className="op-stat-lbl">{selectedDriverId ? `Motoboy: ${selectedDriverName}` : 'Motoboys'}</span>
              <svg
                className={`op-stat-chevron ${driverFilterOpen ? 'open' : ''}`}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {driverFilterOpen && (
              <div className="op-driver-menu">
                <button
                  className={`op-driver-menu-item ${selectedDriverId == null ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedDriverId(null)
                    setDriverFilterOpen(false)
                  }}
                  type="button"
                >
                  Todos os motoboys
                </button>
                {drivers.map(driver => (
                  <button
                    key={driver.id}
                    className={`op-driver-menu-item ${selectedDriverId === driver.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedDriverId(driver.id)
                      setDriverFilterOpen(false)
                    }}
                    type="button"
                  >
                    {driver.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="op-body">
        {/* MAP */}
        <div className="op-map">
          <OperationalMap
            store={store}
            orders={orders}
            markerStates={markerStates}
            routeCoords={geoRouteCoords.length >= 2 ? geoRouteCoords : routeCoords}
            onOrderCtrlClick={(id) => setPopupOrderId(prev => prev === id ? null : id)}
            driverHighlightMarkers={driverHighlightMarkers}
            highlightFinalized={(() => {
              const f = finalized.find(e => e.id === selectedFinalizedId)
              if (!f) return null
              const coord: [number, number] | null =
                f.latitude != null && f.longitude != null
                  ? [f.latitude, f.longitude]
                  : geocodedCoords[f.id] ?? null
              return coord
                ? { coord, code: f.code, platformColor: PLATFORM_COLORS[f.platform] ?? '#666677' }
                : null
            })()}
          />

          {popupOrder && (
            <OrderDetailPopup
              order={popupOrder}
              onClose={() => setPopupOrderId(null)}
            />
          )}

          {/* Legend */}
          <div className="map-legend">
            <div className="legend-note">Borda do ícone = plataforma</div>
            <div className="legend-row">
              <span className="legend-dot" style={{ background: MARKER_STATUS_COLORS.outsideSuggestion }} />
              Fora de sugestão
            </div>
            <div className="legend-row">
              <span className="legend-dot" style={{ background: MARKER_STATUS_COLORS.pendingSuggestion }} />
              Em sugestão pendente
            </div>
            <div className="legend-row">
              <span className="legend-dot" style={{ background: MARKER_STATUS_COLORS.selectedSuggestion }} />
              Sugestão selecionada
            </div>
            <div className="legend-row">
              <span className="legend-dot" style={{ background: MARKER_STATUS_COLORS.recentlyDispatched }} />
              Recém despachado
            </div>
            <div className="legend-row">
              <span className="legend-dot" style={{ background: MARKER_STATUS_COLORS.ghost, border: '1px dashed #444' }} />
              Fantasma
            </div>
            <div className="legend-row">
              <span style={{ fontSize: 14, lineHeight: 1 }}>🏠</span>
              Loja
            </div>
            {selectedDriverId && (
              <div className="legend-row">
                <span className="legend-dot" style={{ background: MARKER_STATUS_COLORS.driverFocus }} />
                Foco: {selectedDriverName}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="op-panel-right">
          {/* Tabs */}
          <div className="panel-tabs">
            <button
              className={`panel-tab ${activeTab === 'suggestions' ? 'active' : ''}`}
              onClick={() => setActiveTab('suggestions')}
            >
              Sugestões
              <span className="panel-tab-badge">{suggestions.length}</span>
            </button>
            <button
              className={`panel-tab ${activeTab === 'inprogress' ? 'active' : ''}`}
              onClick={() => setActiveTab('inprogress')}
            >
              Em andamento
              <span className="panel-tab-badge">{inProgress.length}</span>
            </button>
            <button
              className={`panel-tab ${activeTab === 'finalized' ? 'active' : ''}`}
              onClick={() => setActiveTab('finalized')}
            >
              Finalizados
              <span className="panel-tab-badge">{finalized.length}</span>
            </button>
          </div>

          {/* Content */}
          <div className="panel-content">
            {activeTab === 'suggestions' ? (
              suggestions.length === 0 ? (
                <div className="panel-empty">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                    <rect x="9" y="3" width="6" height="4" rx="1"/>
                    <line x1="9" y1="12" x2="15" y2="12"/>
                    <line x1="9" y1="16" x2="13" y2="16"/>
                  </svg>
                  Nenhuma sugestão pendente
                </div>
              ) : (
                <>
                  {suggestions.length >= 2 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      padding: '4px 8px 8px',
                    }}>
                      <button
                        onClick={handleBulkReject}
                        disabled={loadingAction === '__bulk__'}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 4,
                          border: '1px solid #5a1b1b',
                          background: '#2a0e0e',
                          color: '#fca5a5',
                          cursor: loadingAction === '__bulk__' ? 'wait' : 'pointer',
                        }}
                        title="Recusar todas as sugestões pendentes"
                      >
                        {loadingAction === '__bulk__'
                          ? 'Recusando...'
                          : `Recusar todas (${suggestions.length})`}
                      </button>
                    </div>
                  )}
                  {suggestions.map(s => (
                  <SuggestionBlock
                    key={s.id}
                    suggestion={s}
                    drivers={drivers}
                    isSelected={selectedSuggId === s.id}
                    driverValue={driverSelections[s.id] ?? ''}
                    loading={loadingAction === s.id}
                    onSelect={() => setSelectedSuggId(prev => prev === s.id ? null : s.id)}
                    onDriverChange={val => setDriverSelections(prev => ({ ...prev, [s.id]: val }))}
                    onAccept={() => handleAccept(s)}
                    onReject={() => handleReject(s)}
                    onEdit={() => setEditingSuggId(s.id)}
                  />
                ))}
                </>
              )
            ) : activeTab === 'inprogress' ? (
              inProgress.length === 0 ? (
                <div className="panel-empty">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  Nenhum despacho em andamento
                </div>
              ) : (
                inProgress.map(entry => (
                  <InProgressBlock key={entry.suggestionId} entry={entry} />
                ))
              )
            ) : (
              finalized.length === 0 ? (
                <div className="panel-empty">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="9 11 12 14 22 4"/>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                  </svg>
                  Nenhum pedido finalizado hoje
                </div>
              ) : (
                finalized.map(entry => (
                  <FinalizedBlock
                    key={entry.id}
                    entry={entry}
                    isSelected={selectedFinalizedId === entry.id}
                    isGeocoding={geocodingId === entry.id}
                    onClick={() => handleFinalizedClick(entry)}
                  />
                ))
              )
            )}
          </div>
        </div>
      </div>

      {editingSuggestion && (
        <EditSuggestionModal
          suggestion={editingSuggestion}
          availableOrders={editingAvailable}
          otherSuggestions={editingOtherSuggestions}
          storeCoord={store?.latitude != null && store?.longitude != null
            ? [store.latitude, store.longitude]
            : null
          }
          onSave={handleEditSave}
          onClose={() => setEditingSuggId(null)}
        />
      )}

      <ConfirmDialog
        open={bulkRejectOpen}
        variant="danger"
        title="Recusar todas as sugestões?"
        message={`Isso vai recusar ${suggestions.length} sugestões pendentes. Os pedidos voltam à fila e serão reagrupados.`}
        confirmLabel="Recusar todas"
        cancelLabel="Cancelar"
        onConfirm={confirmBulkReject}
        onCancel={() => setBulkRejectOpen(false)}
      />
    </div>
  )
}

// ── EditSuggestionModal ───────────────────────────────────────────────────────

interface EditSuggestionModalProps {
  suggestion:        SuggestionRow
  availableOrders:   Order[]
  otherSuggestions:  SuggestionRow[]
  storeCoord:        [number, number] | null
  onSave:            (suggestionId: string, newSequence: Order[]) => Promise<void>
  onClose:           () => void
}

function EditSuggestionModal({
  suggestion, availableOrders, otherSuggestions, storeCoord, onSave, onClose,
}: EditSuggestionModalProps) {
  const [sequence, setSequence]     = useState<Order[]>(suggestion.orders)
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [optimizing, setOptimizing] = useState(false)

  const currentIds = useMemo(() => new Set(sequence.map(o => o.id)), [sequence])
  const pickable   = availableOrders.filter(o => !currentIds.has(o.id))

  function removeOrder(orderId: string) {
    setSequence(prev => prev.filter(o => o.id !== orderId))
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    setSequence(prev => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveDown(idx: number) {
    setSequence(prev => {
      if (idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  async function addOrder(order: Order) {
    const newSeq = [...sequence, order]
    setShowPicker(false)

    // Auto-optimize sequence via OSRM when store coords are available
    if (storeCoord && newSeq.every(o => o.latitude != null && o.longitude != null)) {
      setOptimizing(true)
      try {
        const { sequence: opt } = await findOptimalSequence(storeCoord, newSeq)
        setSequence(opt)
      } catch {
        setSequence(newSeq)
      } finally {
        setOptimizing(false)
      }
    } else {
      setSequence(newSeq)
    }
  }

  async function handleSave() {
    if (sequence.length === 0) return
    setSaving(true)
    await onSave(suggestion.id, sequence)
    setSaving(false)
  }

  return (
    <div className="edit-modal-overlay" onClick={onClose}>
      <div className="edit-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="edit-modal-header">
          <span>Editar sugestão <strong>#{suggestion.id.slice(0, 8).toUpperCase()}</strong></span>
          <button className="edit-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Sequence list */}
        <div className="edit-modal-body">
          {optimizing ? (
            <div className="edit-optimizing">Otimizando rota...</div>
          ) : sequence.length === 0 ? (
            <div className="edit-empty">Nenhuma entrega — adicione ao menos uma</div>
          ) : (
            sequence.map((order, idx) => {
              const inOtherSugg = otherSuggestions.find(s => s.orders.some(o => o.id === order.id))
              return (
                <div key={order.id} className="edit-stop">
                  <span className="edit-stop-num">{idx + 1}</span>
                  <span className="edit-stop-dot" style={{ background: PLATFORM_COLORS[order.platform] }} />
                  <div className="edit-stop-info">
                    <div className="edit-stop-customer">{order.customer_name}</div>
                    <div className="edit-stop-address">{shortAddress(order)}</div>
                    {inOtherSugg && (
                      <div className="edit-stop-stolen">
                        Retirar de #{inOtherSugg.id.slice(0, 8).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <button
                    className="edit-stop-remove"
                    onClick={() => removeOrder(order.id)}
                    title="Remover entrega"
                  >
                    −
                  </button>
                  <div className="edit-stop-move">
                    <button
                      className="edit-move-btn"
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      title="Mover para cima"
                    >▲</button>
                    <button
                      className="edit-move-btn"
                      onClick={() => moveDown(idx)}
                      disabled={idx === sequence.length - 1}
                      title="Mover para baixo"
                    >▼</button>
                  </div>
                </div>
              )
            })
          )}

          <button className="edit-add-btn" onClick={() => setShowPicker(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Adicionar entrega
          </button>
        </div>

        {/* Footer */}
        <div className="edit-modal-footer">
          <button className="edit-cancel-btn" onClick={onClose}>Cancelar</button>
          <button
            className="edit-save-btn"
            disabled={saving || sequence.length === 0}
            onClick={handleSave}
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Order picker */}
      {showPicker && (
        <div className="edit-picker-overlay" onClick={() => setShowPicker(false)}>
          <div className="edit-picker" onClick={e => e.stopPropagation()}>
            <div className="edit-picker-header">
              <span>Selecionar entrega</span>
              <button className="edit-modal-close" onClick={() => setShowPicker(false)}>✕</button>
            </div>
            <div className="edit-picker-list">
              {pickable.length === 0 ? (
                <div className="edit-picker-empty">Nenhuma entrega disponível</div>
              ) : (
                pickable.map(order => {
                  const inOtherSugg = otherSuggestions.find(s => s.orders.some(o => o.id === order.id))
                  return (
                    <div
                      key={order.id}
                      className="edit-picker-item"
                      onClick={() => addOrder(order)}
                    >
                      <span className="edit-picker-dot" style={{ background: PLATFORM_COLORS[order.platform] }} />
                      <div className="edit-picker-info">
                        <div className="edit-picker-customer">{order.customer_name}</div>
                        <div className="edit-picker-address">{shortAddress(order)}</div>
                        {inOtherSugg && (
                          <div className="edit-picker-stolen">
                            Em sugestão #{inOtherSugg.id.slice(0, 8).toUpperCase()} — será retirado
                          </div>
                        )}
                      </div>
                      <span className="edit-picker-amount">{formatCurrency(order.total_amount)}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── FinalizedBlock ────────────────────────────────────────────────────────────

const FINALIZED_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  dispatched: { label: 'Despachado', color: '#60a5fa' },
  delivered:  { label: 'Entregue',   color: '#4ade80' },
  cancelled:  { label: 'Cancelado',  color: '#f87171' },
}

function FinalizedBlock({ entry, isSelected, isGeocoding, onClick }: {
  entry: FinalizedEntry
  isSelected: boolean
  isGeocoding: boolean
  onClick: () => void
}) {
  const platformColor = PLATFORM_COLORS[entry.platform] ?? '#666677'
  const st = FINALIZED_STATUS_LABEL[entry.status] ?? { label: entry.status, color: '#888' }
  const hasAddress = !!(entry.addressStreet || entry.addressZip || entry.latitude != null)

  return (
    <div
      className={`fin-block clickable ${isSelected ? 'selected' : ''} ${isGeocoding ? 'geocoding' : ''}`}
      onClick={hasAddress ? onClick : undefined}
      style={!hasAddress ? { cursor: 'default' } : undefined}
    >
      <span className="fin-platform-dot" style={{ background: platformColor }} />
      <div className="fin-info">
        <div className="fin-top">
          <span className="fin-code">{entry.code}</span>
          <span className="fin-status" style={{ color: st.color }}>{st.label}</span>
        </div>
        <div className="fin-customer">{entry.customerName}</div>
        <div className="fin-driver">
          {entry.driverName
            ? entry.driverName
            : <span className="fin-driver-none">motoboy não identificado</span>
          }
        </div>
      </div>
      <span className="fin-amount">{formatCurrency(entry.totalAmount)}</span>
      {isGeocoding && <span className="fin-geocoding-spinner" />}
    </div>
  )
}

// ── OrderDetailPopup ──────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  pix:         'PIX',
  credit_card: 'Crédito',
  debit_card:  'Débito',
  cash:        'Dinheiro',
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

function OrderDetailPopup({ order, onClose }: { order: Order; onClose: () => void }) {
  const platformColor = PLATFORM_COLORS[order.platform] ?? '#666677'
  const address = [
    order.address_street,
    order.address_number,
    order.address_complement,
    order.address_neighborhood,
    order.address_city,
  ].filter(Boolean).join(', ')

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 1000,
        width: 290,
        background: '#111',
        border: `1.5px solid ${platformColor}`,
        borderRadius: 10,
        boxShadow: '0 6px 24px rgba(0,0,0,.8)',
        overflow: 'hidden',
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      }}
    >
      {/* Header */}
      <div style={{
        background: platformColor,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-.2px' }}>
            {order.platform_order_code ?? order.platform_order_id.slice(0, 8)}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600,
            background: 'rgba(0,0,0,.25)',
            color: '#fff',
            borderRadius: 4,
            padding: '2px 6px',
          }}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#fff', fontSize: 16, lineHeight: 1, padding: 2,
            opacity: 0.8,
          }}
        >×</button>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Customer */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#eee' }}>{order.customer_name}</div>
          {order.customer_phone && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{order.customer_phone}</div>
          )}
        </div>

        {/* Address */}
        {address && (
          <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5 }}>
            {address}
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: '1px solid #222' }} />

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {order.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#ccc' }}>
                {item.quantity}× {item.name}
              </span>
              <span style={{ color: '#888' }}>
                {formatCurrency(item.total_price)}
              </span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #222' }} />

        {/* Total + payment */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
            {formatCurrency(order.total_amount)}
          </span>
          {order.payment_method && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              color: '#aaa',
              borderRadius: 4,
              padding: '2px 7px',
            }}>
              {PAYMENT_LABELS[order.payment_method] ?? order.payment_method}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
