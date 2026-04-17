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

export default function Drivers() {
  const [drivers, setDrivers]     = useState<Driver[]>([])
  const [loading, setLoading]     = useState(true)
  const [newName, setNewName]     = useState('')
  const [adding, setAdding]       = useState(false)
  const [filter, setFilter]       = useState<Filter>('active')
  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null)
  const storeIdRef  = useRef<string | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)

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
