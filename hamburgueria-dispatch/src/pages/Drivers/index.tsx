import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Driver } from '../../types'
import './Drivers.css'

// ── Confirm Delete Modal ──────────────────────────────────────────────────────

function ConfirmModal({
  open,
  driverName,
  onConfirm,
  onCancel,
}: {
  open: boolean
  driverName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) requestAnimationFrame(() => setVisible(true))
    else setVisible(false)
  }, [open])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  if (!open && !visible) return null

  return (
    <div className={`confirm-overlay ${visible ? 'open' : ''}`} onClick={onCancel}>
      <div className="confirm-card" onClick={e => e.stopPropagation()}>
        <div className="confirm-title">Remover motorista</div>
        <div className="confirm-text">
          Tem certeza que deseja remover <strong style={{ color: '#ddd' }}>{driverName}</strong>?
          Esta ação não pode ser desfeita.
        </div>
        <div className="confirm-actions">
          <button className="btn-confirm-cancel" onClick={onCancel}>Cancelar</button>
          <button className="btn-confirm-delete" onClick={onConfirm}>Remover</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

type Filter = 'all' | 'active' | 'inactive'

interface DriverReportRow {
  driverId: string
  driverName: string
  totalDeliveries: number
  deliveredCount: number
  dispatchedCount: number
  cancelledCount: number
  totalAmount: number
  lastDispatchAt: string | null
}

function localDateInput(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function parseDateYmd(value?: string | null): Date | null {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null
  return date
}

function formatDateYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function formatDateLabel(value: string): string {
  const date = parseDateYmd(value)
  if (!date) return 'Selecionar data'
  return date.toLocaleDateString('pt-BR')
}

const WEEKDAYS_PT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

interface CalendarPickerProps {
  value: string
  min?: string
  max?: string
  onSelect: (value: string) => void
}

function CalendarPicker({ value, min, max, onSelect }: CalendarPickerProps) {
  const selectedDate = parseDateYmd(value) ?? new Date()
  const minDate = parseDateYmd(min)
  const maxDate = parseDateYmd(max)
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  )

  useEffect(() => {
    const next = parseDateYmd(value) ?? new Date()
    setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1))
  }, [value])

  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const firstWeekday = (monthStart.getDay() + 6) % 7 // Monday-based
  const gridStart = new Date(monthStart)
  gridStart.setDate(monthStart.getDate() - firstWeekday)

  const prevMonthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
  const prevMonthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0)
  const nextMonthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)

  const minStart = minDate ? startOfDay(minDate) : null
  const maxEnd = maxDate ? endOfDay(maxDate) : null

  const canGoPrev = !minStart || prevMonthEnd >= minStart
  const canGoNext = !maxEnd || nextMonthStart <= maxEnd

  const days = Array.from({ length: 42 }, (_, idx) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + idx)
    const dayStart = startOfDay(date)
    const disabled = (minStart && dayStart < minStart) || (maxEnd && dayStart > maxEnd)
    const ymd = formatDateYmd(date)
    return {
      date,
      ymd,
      inMonth: date.getMonth() === viewMonth.getMonth(),
      disabled: Boolean(disabled),
      selected: ymd === value,
    }
  })

  return (
    <div className="drivers-report-calendar" role="dialog" aria-label="Calendario">
      <div className="drivers-report-calendar-head">
        <button
          type="button"
          className="drivers-report-calendar-nav"
          onClick={() => canGoPrev && setViewMonth(prevMonthStart)}
          disabled={!canGoPrev}
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <span className="drivers-report-calendar-title">
          {MONTHS_PT[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </span>
        <button
          type="button"
          className="drivers-report-calendar-nav"
          onClick={() => canGoNext && setViewMonth(nextMonthStart)}
          disabled={!canGoNext}
          aria-label="Proximo mes"
        >
          ›
        </button>
      </div>

      <div className="drivers-report-calendar-grid">
        {WEEKDAYS_PT.map((day) => (
          <span key={`weekday-${day}`} className="drivers-report-calendar-weekday">{day}</span>
        ))}
        {days.map((day) => (
          <button
            key={day.ymd}
            type="button"
            className={[
              'drivers-report-calendar-day',
              !day.inMonth ? 'outside' : '',
              day.selected ? 'selected' : '',
              day.disabled ? 'disabled' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => !day.disabled && onSelect(day.ymd)}
            disabled={day.disabled}
          >
            {day.date.getDate()}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Drivers() {
  const [drivers, setDrivers]     = useState<Driver[]>([])
  const [loading, setLoading]     = useState(true)
  const [newName, setNewName]     = useState('')
  const [adding, setAdding]       = useState(false)
  const [filter, setFilter]       = useState<Filter>('active')
  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null)
  const [reportStart, setReportStart] = useState(() => localDateInput(-7))
  const [reportEnd, setReportEnd]     = useState(() => localDateInput(0))
  const [reportRows, setReportRows]   = useState<DriverReportRow[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null)
  const [openReportCalendar, setOpenReportCalendar] = useState<'start' | 'end' | null>(null)
  const storeIdRef  = useRef<string | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const reportStartWrapRef = useRef<HTMLDivElement>(null)
  const reportEndWrapRef   = useRef<HTMLDivElement>(null)

  // ── Resolve store_id ────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return
      const { data } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (data) {
        storeIdRef.current = data.store_id
        fetchDrivers(data.store_id)
      } else {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!openReportCalendar) return

    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node
      const wrap = openReportCalendar === 'start'
        ? reportStartWrapRef.current
        : reportEndWrapRef.current
      if (wrap && !wrap.contains(target)) {
        setOpenReportCalendar(null)
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenReportCalendar(null)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [openReportCalendar])

  // ── Fetch ───────────────────────────────────────────────────────────────────
  async function fetchDrivers(storeId?: string) {
    const sid = storeId ?? storeIdRef.current
    if (!sid) return

    const { data } = await supabase
      .from('drivers')
      .select('*')
      .eq('store_id', sid)
      .order('name')

    setDrivers((data ?? []) as Driver[])
    setLoading(false)
  }

  // ── Add ─────────────────────────────────────────────────────────────────────
  async function handleAdd() {
    const name = newName.trim()
    if (!name || !storeIdRef.current) return

    setAdding(true)
    const { error } = await supabase.from('drivers').insert({
      store_id:   storeIdRef.current,
      name,
      active:     true,
      created_at: new Date().toISOString(),
    })
    setAdding(false)

    if (!error) {
      setNewName('')
      await fetchDrivers()
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleAdd()
  }

  // ── Toggle active ───────────────────────────────────────────────────────────
  async function handleToggle(driver: Driver) {
    await supabase
      .from('drivers')
      .update({ active: !driver.active })
      .eq('id', driver.id)
    await fetchDrivers()
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    await supabase.from('drivers').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    await fetchDrivers()
  }

  async function handleGenerateReport() {
    const sid = storeIdRef.current
    if (!sid) return

    if (!reportStart || !reportEnd) {
      setReportError('Selecione inicio e fim do periodo.')
      return
    }

    if (reportStart > reportEnd) {
      setReportError('Data inicial nao pode ser maior que a data final.')
      return
    }

    setReportLoading(true)
    setReportError('')

    const periodStart = new Date(`${reportStart}T00:00:00`)
    const periodEndExclusive = new Date(`${reportEnd}T00:00:00`)
    periodEndExclusive.setDate(periodEndExclusive.getDate() + 1)

    const { data: suggestions, error: suggestionsError } = await supabase
      .from('dispatch_suggestions')
      .select('id,assigned_driver_id,reviewed_at,status')
      .eq('store_id', sid)
      .eq('status', 'dispatched')
      .not('assigned_driver_id', 'is', null)
      .gte('reviewed_at', periodStart.toISOString())
      .lt('reviewed_at', periodEndExclusive.toISOString())

    if (suggestionsError) {
      setReportError(suggestionsError.message)
      setReportRows([])
      setReportLoading(false)
      return
    }

    const suggestionRows = suggestions ?? []
    if (suggestionRows.length === 0) {
      setReportRows([])
      setReportGeneratedAt(new Date().toISOString())
      setReportLoading(false)
      return
    }

    const suggestionIds = suggestionRows.map(s => s.id)
    const { data: links, error: linksError } = await supabase
      .from('dispatch_suggestion_orders')
      .select('suggestion_id,order_id')
      .in('suggestion_id', suggestionIds)

    if (linksError) {
      setReportError(linksError.message)
      setReportRows([])
      setReportLoading(false)
      return
    }

    const linkRows = links ?? []
    if (linkRows.length === 0) {
      setReportRows([])
      setReportGeneratedAt(new Date().toISOString())
      setReportLoading(false)
      return
    }

    const orderIds = [...new Set(linkRows.map(l => l.order_id as string))]
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id,status,total_amount,dispatched_at,updated_at')
      .in('id', orderIds)

    if (ordersError) {
      setReportError(ordersError.message)
      setReportRows([])
      setReportLoading(false)
      return
    }

    const driverNameById = new Map(drivers.map(d => [d.id, d.name]))
    const suggestionDriverById = new Map<string, string>(
      suggestionRows.map(s => [s.id as string, s.assigned_driver_id as string]),
    )
    const orderById = new Map((orders ?? []).map(o => [o.id, o]))

    const aggregate = new Map<string, DriverReportRow & { seenOrderIds: Set<string> }>()

    for (const link of linkRows) {
      const suggestionId = link.suggestion_id as string
      const orderId = link.order_id as string
      const driverId = suggestionDriverById.get(suggestionId)
      if (!driverId) continue
      const order = orderById.get(orderId)
      if (!order) continue

      const current = aggregate.get(driverId) ?? {
        driverId,
        driverName: driverNameById.get(driverId) ?? 'Motorista removido',
        totalDeliveries: 0,
        deliveredCount: 0,
        dispatchedCount: 0,
        cancelledCount: 0,
        totalAmount: 0,
        lastDispatchAt: null,
        seenOrderIds: new Set<string>(),
      }

      if (current.seenOrderIds.has(order.id)) {
        aggregate.set(driverId, current)
        continue
      }

      current.seenOrderIds.add(order.id)
      current.totalDeliveries += 1
      current.totalAmount += Number(order.total_amount ?? 0)

      if (order.status === 'delivered') current.deliveredCount += 1
      else if (order.status === 'cancelled') current.cancelledCount += 1
      else if (order.status === 'dispatched') current.dispatchedCount += 1

      const referenceDate = (order.dispatched_at ?? order.updated_at) as string | null
      if (referenceDate) {
        if (!current.lastDispatchAt || new Date(referenceDate) > new Date(current.lastDispatchAt)) {
          current.lastDispatchAt = referenceDate
        }
      }

      aggregate.set(driverId, current)
    }

    const rows: DriverReportRow[] = Array.from(aggregate.values())
      .map(({ seenOrderIds: _seen, ...row }) => row)
      .sort((a, b) => {
        if (b.totalDeliveries !== a.totalDeliveries) return b.totalDeliveries - a.totalDeliveries
        return a.driverName.localeCompare(b.driverName)
      })

    setReportRows(rows)
    setReportGeneratedAt(new Date().toISOString())
    setReportLoading(false)
  }

  function handleExportReportCsv() {
    if (reportRows.length === 0) return
    const header = [
      'Motoboy',
      'Entregas',
      'Entregues',
      'Em rota',
      'Canceladas',
      'Faturamento',
      'Ultimo despacho',
    ]
    const lines = reportRows.map(row => [
      `"${row.driverName.replace(/"/g, '""')}"`,
      row.totalDeliveries,
      row.deliveredCount,
      row.dispatchedCount,
      row.cancelledCount,
      row.totalAmount.toFixed(2),
      row.lastDispatchAt ? new Date(row.lastDispatchAt).toLocaleString('pt-BR') : '',
    ].join(','))

    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-motoboys-${reportStart}-a-${reportEnd}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function toggleReportCalendar(kind: 'start' | 'end') {
    setOpenReportCalendar(prev => (prev === kind ? null : kind))
  }

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = drivers.filter(d => {
    if (filter === 'active')   return d.active
    if (filter === 'inactive') return !d.active
    return true
  })

  const counts = {
    all:      drivers.length,
    active:   drivers.filter(d => d.active).length,
    inactive: drivers.filter(d => !d.active).length,
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <div className="drivers-panel"><div className="drivers-loading">Carregando...</div></div>

  return (
    <div className="drivers-panel">
      {/* Header */}
      <div className="drivers-header">
        <h1>Motoristas</h1>
        <span style={{ fontSize: 12, color: '#444' }}>
          {counts.active} ativo{counts.active !== 1 ? 's' : ''} · {counts.inactive} inativo{counts.inactive !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Add bar */}
      <div className="drivers-add-bar">
        <input
          ref={inputRef}
          className="drivers-add-input"
          placeholder="Nome do motorista..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={80}
        />
        <button
          className="btn-add-driver"
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {adding ? 'Adicionando...' : 'Adicionar'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="drivers-filter">
        {(['all', 'active', 'inactive'] as Filter[]).map(f => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {{
              all:      `Todos (${counts.all})`,
              active:   `Ativos (${counts.active})`,
              inactive: `Inativos (${counts.inactive})`,
            }[f]}
          </button>
        ))}
      </div>

      <div className="drivers-report">
        <div className="drivers-report-header">
          <div>
            <div className="drivers-report-title">Relatorios por motoboy</div>
            <div className="drivers-report-subtitle">Consolidado de entregas despachadas no periodo.</div>
          </div>
          {reportGeneratedAt && (
            <span className="drivers-report-updated">
              Atualizado em {new Date(reportGeneratedAt).toLocaleString('pt-BR')}
            </span>
          )}
        </div>

        <div className="drivers-report-controls">
          <label className="drivers-report-field">
            <span>Inicio</span>
            <div
              className={`drivers-report-date-wrap ${openReportCalendar === 'start' ? 'open' : ''}`}
              ref={reportStartWrapRef}
            >
              <button
                type="button"
                className="drivers-report-date-trigger"
                onClick={() => toggleReportCalendar('start')}
                aria-label="Selecionar data inicial"
              >
                <span className="drivers-report-date-value">{formatDateLabel(reportStart)}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
              {openReportCalendar === 'start' && (
                <CalendarPicker
                  value={reportStart}
                  max={reportEnd}
                  onSelect={(next) => {
                    setReportStart(next)
                    if (next > reportEnd) setReportEnd(next)
                    setOpenReportCalendar(null)
                  }}
                />
              )}
            </div>
          </label>
          <label className="drivers-report-field">
            <span>Fim</span>
            <div
              className={`drivers-report-date-wrap ${openReportCalendar === 'end' ? 'open' : ''}`}
              ref={reportEndWrapRef}
            >
              <button
                type="button"
                className="drivers-report-date-trigger"
                onClick={() => toggleReportCalendar('end')}
                aria-label="Selecionar data final"
              >
                <span className="drivers-report-date-value">{formatDateLabel(reportEnd)}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
              {openReportCalendar === 'end' && (
                <CalendarPicker
                  value={reportEnd}
                  min={reportStart}
                  onSelect={(next) => {
                    setReportEnd(next)
                    setOpenReportCalendar(null)
                  }}
                />
              )}
            </div>
          </label>
          <button
            className="btn-generate-report"
            onClick={handleGenerateReport}
            disabled={reportLoading}
          >
            {reportLoading ? 'Gerando...' : 'Gerar relatorio'}
          </button>
          <button
            className="btn-export-report"
            onClick={handleExportReportCsv}
            disabled={reportRows.length === 0}
          >
            Exportar CSV
          </button>
        </div>

        {reportError && <div className="drivers-report-error">{reportError}</div>}

        <div className="drivers-report-table-wrap">
          {reportRows.length === 0 ? (
            <div className="drivers-report-empty">
              {reportLoading ? 'Buscando dados...' : 'Nenhum despacho encontrado para o periodo selecionado.'}
            </div>
          ) : (
            <table className="drivers-report-table">
              <thead>
                <tr>
                  <th>Motoboy</th>
                  <th>Entregas</th>
                  <th>Entregues</th>
                  <th>Em rota</th>
                  <th>Canceladas</th>
                  <th>Faturamento</th>
                  <th>Ultimo despacho</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map(row => (
                  <tr key={row.driverId}>
                    <td>{row.driverName}</td>
                    <td>{row.totalDeliveries}</td>
                    <td>{row.deliveredCount}</td>
                    <td>{row.dispatchedCount}</td>
                    <td>{row.cancelledCount}</td>
                    <td>{formatCurrency(row.totalAmount)}</td>
                    <td>{row.lastDispatchAt ? new Date(row.lastDispatchAt).toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* List */}
      <div className="drivers-content">
        {filtered.length === 0 ? (
          <div className="drivers-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="10" r="3"/>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
            </svg>
            {filter === 'all'
              ? 'Nenhum motorista cadastrado'
              : filter === 'active'
              ? 'Nenhum motorista ativo'
              : 'Nenhum motorista inativo'}
          </div>
        ) : (
          <div className="drivers-list">
            {filtered.map(driver => (
              <div
                key={driver.id}
                className={`driver-row ${driver.active ? '' : 'inactive'}`}
              >
                <span
                  className="driver-row-dot"
                  style={{ background: driver.active ? '#27AE60' : '#333' }}
                />
                <span className="driver-row-name">{driver.name}</span>
                <span className="driver-row-date">
                  desde {new Date(driver.created_at).toLocaleDateString('pt-BR')}
                </span>
                <span className={`driver-row-status ${driver.active ? 'active-badge' : 'inactive-badge'}`}>
                  {driver.active ? 'Ativo' : 'Inativo'}
                </span>
                <div className="driver-row-actions">
                  <button
                    className={`btn-toggle-driver ${!driver.active ? 'activate' : ''}`}
                    onClick={() => handleToggle(driver)}
                  >
                    {driver.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    className="btn-delete-driver"
                    onClick={() => setDeleteTarget(driver)}
                    title="Remover motorista"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        driverName={deleteTarget?.name ?? ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
