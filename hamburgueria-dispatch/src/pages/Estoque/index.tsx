import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import './Estoque.css'

const UNITS = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'dz']

interface StockItem {
  id: string
  store_id: string
  name: string
  unit: string
  quantity: number
  min_quantity: number
  created_at: string
  updated_at: string
}

interface FormState {
  name: string
  unit: string
  quantity: string
  min_quantity: string
}

const EMPTY_FORM: FormState = { name: '', unit: 'un', quantity: '0', min_quantity: '0' }

function parseNum(v: string) {
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function formatQty(v: number, unit: string) {
  const str = Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
  return `${str} ${unit}`
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface ItemModalProps {
  open: boolean
  editItem: StockItem | null
  onClose: () => void
  onSave: (form: FormState) => Promise<void>
}

function ItemModal({ open, editItem, onClose, onSave }: ItemModalProps) {
  const [form, setForm]       = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(editItem ? {
        name:         editItem.name,
        unit:         editItem.unit,
        quantity:     String(editItem.quantity),
        min_quantity: String(editItem.min_quantity),
      } : EMPTY_FORM)
      setError('')
      setSaving(false)
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [open, editItem])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  if (!open && !visible) return null

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Nome obrigatório'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className={`estoque-overlay ${visible ? 'open' : ''}`} onClick={onClose}>
      <div className="estoque-modal" onClick={e => e.stopPropagation()}>
        <div className="estoque-modal-title">{editItem ? 'Editar item' : 'Novo item'}</div>

        <div className="estoque-field">
          <label>Nome do item</label>
          <input
            className="estoque-input"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            maxLength={100}
            placeholder="Ex: Pão de hambúrguer"
            autoFocus
          />
        </div>

        <div className="estoque-field-row">
          <div className="estoque-field">
            <label>Unidade</label>
            <select
              className="estoque-select"
              value={form.unit}
              onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
            >
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="estoque-field">
            <label>Quantidade atual</label>
            <input
              className="estoque-input"
              value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
              placeholder="0"
            />
          </div>
          <div className="estoque-field">
            <label>Estoque mínimo</label>
            <input
              className="estoque-input"
              value={form.min_quantity}
              onChange={e => setForm(f => ({ ...f, min_quantity: e.target.value }))}
              placeholder="0"
            />
          </div>
        </div>

        {error && <p className="estoque-error">{error}</p>}

        <div className="estoque-modal-actions">
          <button className="btn-estoque-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-estoque-save" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Adjust Modal (quick +/-) ─────────────────────────────────────────────────

interface AdjustModalProps {
  open: boolean
  item: StockItem | null
  onClose: () => void
  onAdjust: (itemId: string, newQty: number) => Promise<void>
}

function AdjustModal({ open, item, onClose, onAdjust }: AdjustModalProps) {
  const [delta, setDelta]     = useState('')
  const [mode, setMode]       = useState<'add' | 'sub'>('add')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setDelta('')
      setMode('add')
      setError('')
      setSaving(false)
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [open])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  if (!open && !visible || !item) return null

  async function handleConfirm() {
    if (!item) return
    const d = parseNum(delta)
    if (d <= 0) { setError('Valor deve ser maior que zero'); return }
    const newQty = mode === 'add' ? item.quantity + d : Math.max(0, item.quantity - d)
    setSaving(true)
    setError('')
    try {
      await onAdjust(item.id, newQty)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className={`estoque-overlay ${visible ? 'open' : ''}`} onClick={onClose}>
      <div className="estoque-modal estoque-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="estoque-modal-title">Ajustar estoque</div>
        <div className="estoque-adjust-name">{item.name}</div>
        <div className="estoque-adjust-current">
          Atual: <strong>{formatQty(item.quantity, item.unit)}</strong>
        </div>

        <div className="estoque-adjust-mode">
          <button
            className={`estoque-mode-btn ${mode === 'add' ? 'active-add' : ''}`}
            onClick={() => setMode('add')}
          >
            + Entrada
          </button>
          <button
            className={`estoque-mode-btn ${mode === 'sub' ? 'active-sub' : ''}`}
            onClick={() => setMode('sub')}
          >
            − Saída
          </button>
        </div>

        <div className="estoque-field">
          <label>Quantidade ({item.unit})</label>
          <input
            className="estoque-input"
            value={delta}
            onChange={e => setDelta(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </div>

        {error && <p className="estoque-error">{error}</p>}

        <div className="estoque-modal-actions">
          <button className="btn-estoque-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-estoque-save" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

type StockFilter = 'all' | 'low' | 'ok'

export default function Estoque() {
  const [items, setItems]           = useState<StockItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState<StockFilter>('all')
  const [search, setSearch]         = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [editItem, setEditItem]     = useState<StockItem | null>(null)
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null)
  const [dbError, setDbError]       = useState('')
  const storeIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return
      const { data: userData } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (!userData) { setLoading(false); return }
      storeIdRef.current = userData.store_id
      await fetchItems(userData.store_id)
    }
    init()
  }, [])

  async function fetchItems(storeId?: string) {
    const sid = storeId ?? storeIdRef.current
    if (!sid) return
    const { data, error } = await supabase
      .from('stock_items').select('*').eq('store_id', sid).order('name')
    if (error) {
      setDbError('Tabela stock_items não encontrada. Rode a migration necessária.')
      setLoading(false)
      return
    }
    setItems((data ?? []) as StockItem[])
    setLoading(false)
  }

  async function handleSave(form: FormState) {
    const sid = storeIdRef.current
    if (!sid) throw new Error('Loja não identificada')
    const now = new Date().toISOString()
    const payload = {
      store_id:     sid,
      name:         form.name.trim(),
      unit:         form.unit,
      quantity:     parseNum(form.quantity),
      min_quantity: parseNum(form.min_quantity),
      updated_at:   now,
    }
    if (editItem) {
      const { error } = await supabase.from('stock_items').update(payload).eq('id', editItem.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('stock_items').insert({ ...payload, created_at: now })
      if (error) throw new Error(error.message)
    }
    await fetchItems()
  }

  async function handleAdjust(itemId: string, newQty: number) {
    const { error } = await supabase
      .from('stock_items')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', itemId)
    if (error) throw new Error(error.message)
    await fetchItems()
  }

  async function handleDelete(item: StockItem) {
    await supabase.from('stock_items').delete().eq('id', item.id)
    await fetchItems()
  }

  function stockStatus(item: StockItem): 'critical' | 'low' | 'ok' {
    if (item.min_quantity <= 0) return 'ok'
    if (item.quantity <= 0) return 'critical'
    if (item.quantity <= item.min_quantity) return 'critical'
    if (item.quantity <= item.min_quantity * 1.5) return 'low'
    return 'ok'
  }

  const lowCount = items.filter(i => stockStatus(i) !== 'ok').length

  const filtered = items.filter(item => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'low' && stockStatus(item) === 'ok') return false
    if (filter === 'ok'  && stockStatus(item) !== 'ok') return false
    return true
  })

  if (loading) return <div className="estoque-panel"><div className="estoque-loading">Carregando...</div></div>

  return (
    <div className="estoque-panel">
      <div className="estoque-header">
        <div>
          <h1>Estoque</h1>
          <span className="estoque-subtitle">
            {items.length} item{items.length !== 1 ? 's' : ''}
            {lowCount > 0 && <span className="estoque-alert-badge">{lowCount} com estoque baixo</span>}
          </span>
        </div>
        <button
          className="btn-estoque-new"
          onClick={() => { setEditItem(null); setModalOpen(true) }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo item
        </button>
      </div>

      {dbError ? (
        <div className="estoque-db-error">{dbError}</div>
      ) : (
        <>
          <div className="estoque-controls">
            <input
              className="estoque-search"
              placeholder="Buscar item..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="estoque-filter-tabs">
              {(['all', 'low', 'ok'] as StockFilter[]).map(f => (
                <button
                  key={f}
                  className={`estoque-filter-tab ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {{ all: 'Todos', low: 'Baixo', ok: 'OK' }[f]}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="estoque-empty">
              {items.length === 0
                ? 'Nenhum item no estoque. Clique em "Novo item" para começar.'
                : 'Nenhum item para os filtros selecionados.'}
            </div>
          ) : (
            <div className="estoque-list">
              {filtered.map(item => {
                const status = stockStatus(item)
                return (
                  <div key={item.id} className={`estoque-row estoque-row-${status}`}>
                    <div className={`estoque-row-indicator estoque-ind-${status}`} />
                    <div className="estoque-row-info">
                      <span className="estoque-row-name">{item.name}</span>
                      <span className={`estoque-row-qty estoque-qty-${status}`}>
                        {formatQty(item.quantity, item.unit)}
                      </span>
                      {item.min_quantity > 0 && (
                        <span className="estoque-row-min">
                          mín. {formatQty(item.min_quantity, item.unit)}
                        </span>
                      )}
                    </div>
                    <div className="estoque-row-actions">
                      <button
                        className="btn-estoque-adjust"
                        onClick={() => setAdjustItem(item)}
                        title="Ajustar quantidade"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="12" y1="5" x2="12" y2="19"/>
                          <polyline points="19 12 12 19 5 12"/>
                        </svg>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: -6 }}>
                          <line x1="12" y1="19" x2="12" y2="5"/>
                          <polyline points="5 12 12 5 19 12"/>
                        </svg>
                      </button>
                      <button
                        className="btn-estoque-edit"
                        onClick={() => { setEditItem(item); setModalOpen(true) }}
                        title="Editar"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        className="btn-estoque-delete"
                        onClick={() => handleDelete(item)}
                        title="Remover"
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
                )
              })}
            </div>
          )}
        </>
      )}

      <ItemModal
        open={modalOpen}
        editItem={editItem}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
      <AdjustModal
        open={adjustItem !== null}
        item={adjustItem}
        onClose={() => setAdjustItem(null)}
        onAdjust={handleAdjust}
      />
    </div>
  )
}
