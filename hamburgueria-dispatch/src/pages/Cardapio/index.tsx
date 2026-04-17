import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import './Cardapio.css'

const CATEGORIES = ['Lanches', 'Combos', 'Bebidas', 'Sobremesas', 'Acompanhamentos', 'Outros']

interface MenuItem {
  id: string
  store_id: string
  name: string
  description: string | null
  price: number
  category: string
  active: boolean
  created_at: string
}

interface FormState {
  name: string
  description: string
  price: string
  category: string
  active: boolean
}

const EMPTY_FORM: FormState = { name: '', description: '', price: '', category: 'Lanches', active: true }

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

// ── Item Modal ────────────────────────────────────────────────────────────────

interface ItemModalProps {
  open: boolean
  editItem: MenuItem | null
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
        name:        editItem.name,
        description: editItem.description ?? '',
        price:       editItem.price.toFixed(2).replace('.', ','),
        category:    editItem.category,
        active:      editItem.active,
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
    const priceNum = parseFloat(form.price.replace(',', '.'))
    if (isNaN(priceNum) || priceNum < 0) { setError('Preço inválido'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, price: String(priceNum) })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className={`cardapio-overlay ${visible ? 'open' : ''}`} onClick={onClose}>
      <div className="cardapio-modal" onClick={e => e.stopPropagation()}>
        <div className="cardapio-modal-title">{editItem ? 'Editar item' : 'Novo item'}</div>

        <div className="cardapio-field">
          <label>Nome</label>
          <input
            className="cardapio-input"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            maxLength={100}
            placeholder="Ex: X-Burguer Clássico"
            autoFocus
          />
        </div>

        <div className="cardapio-field">
          <label>Descrição</label>
          <textarea
            className="cardapio-textarea"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            maxLength={300}
            placeholder="Ingredientes ou descrição (opcional)..."
            rows={2}
          />
        </div>

        <div className="cardapio-field-row">
          <div className="cardapio-field">
            <label>Preço (R$)</label>
            <input
              className="cardapio-input"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              placeholder="0,00"
            />
          </div>
          <div className="cardapio-field">
            <label>Categoria</label>
            <select
              className="cardapio-select"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="cardapio-field-toggle-row">
          <label>Disponível no cardápio</label>
          <button
            type="button"
            className={`cardapio-toggle ${form.active ? 'on' : 'off'}`}
            onClick={() => setForm(f => ({ ...f, active: !f.active }))}
          >
            <span className="cardapio-toggle-knob" />
            <span className="cardapio-toggle-label">{form.active ? 'Sim' : 'Não'}</span>
          </button>
        </div>

        {error && <p className="cardapio-error">{error}</p>}

        <div className="cardapio-modal-actions">
          <button className="btn-cardapio-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-cardapio-save" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

type ActiveFilter = 'all' | 'active' | 'inactive'

export default function Cardapio() {
  const [items, setItems]             = useState<MenuItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [filterCat, setFilterCat]     = useState('Todos')
  const [filterActive, setFilterActive] = useState<ActiveFilter>('all')
  const [modalOpen, setModalOpen]     = useState(false)
  const [editItem, setEditItem]       = useState<MenuItem | null>(null)
  const [dbError, setDbError]         = useState('')
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
      .from('menu_items').select('*').eq('store_id', sid).order('category').order('name')
    if (error) {
      setDbError('Tabela menu_items não encontrada. Rode a migration necessária.')
      setLoading(false)
      return
    }
    setItems((data ?? []) as MenuItem[])
    setLoading(false)
  }

  async function handleSave(form: FormState) {
    const sid = storeIdRef.current
    if (!sid) throw new Error('Loja não identificada')
    const payload = {
      store_id:    sid,
      name:        form.name.trim(),
      description: form.description.trim() || null,
      price:       parseFloat(form.price),
      category:    form.category,
      active:      form.active,
    }
    if (editItem) {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', editItem.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('menu_items').insert(payload)
      if (error) throw new Error(error.message)
    }
    await fetchItems()
  }

  async function handleToggleActive(item: MenuItem) {
    await supabase.from('menu_items').update({ active: !item.active }).eq('id', item.id)
    await fetchItems()
  }

  async function handleDelete(item: MenuItem) {
    await supabase.from('menu_items').delete().eq('id', item.id)
    await fetchItems()
  }

  const allCategories = ['Todos', ...CATEGORIES]
  const filtered = items.filter(item => {
    if (filterCat !== 'Todos' && item.category !== filterCat) return false
    if (filterActive === 'active' && !item.active) return false
    if (filterActive === 'inactive' && item.active) return false
    return true
  })

  const activeCount = items.filter(i => i.active).length

  if (loading) return <div className="cardapio-panel"><div className="cardapio-loading">Carregando...</div></div>

  return (
    <div className="cardapio-panel">
      <div className="cardapio-header">
        <div>
          <h1>Cardápio</h1>
          <span className="cardapio-subtitle">{activeCount} disponível{activeCount !== 1 ? 'is' : ''} · {items.length} total</span>
        </div>
        <button
          className="btn-cardapio-new"
          onClick={() => { setEditItem(null); setModalOpen(true) }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo item
        </button>
      </div>

      {dbError ? (
        <div className="cardapio-db-error">{dbError}</div>
      ) : (
        <>
          <div className="cardapio-filters">
            <div className="cardapio-cat-tabs">
              {allCategories.map(c => (
                <button
                  key={c}
                  className={`cardapio-cat-tab ${filterCat === c ? 'active' : ''}`}
                  onClick={() => setFilterCat(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="cardapio-status-tabs">
              {(['all', 'active', 'inactive'] as ActiveFilter[]).map(f => (
                <button
                  key={f}
                  className={`cardapio-status-tab ${filterActive === f ? 'active' : ''}`}
                  onClick={() => setFilterActive(f)}
                >
                  {{ all: 'Todos', active: 'Disponíveis', inactive: 'Indisponíveis' }[f]}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="cardapio-empty">
              {items.length === 0
                ? 'Nenhum item cadastrado. Clique em "Novo item" para começar.'
                : 'Nenhum item para os filtros selecionados.'}
            </div>
          ) : (
            <div className="cardapio-list">
              {filtered.map(item => (
                <div key={item.id} className={`cardapio-row ${!item.active ? 'inactive' : ''}`}>
                  <div className="cardapio-row-left">
                    <span className="cardapio-row-cat">{item.category}</span>
                    <span className="cardapio-row-name">{item.name}</span>
                    {item.description && (
                      <span className="cardapio-row-desc">{item.description}</span>
                    )}
                  </div>
                  <div className="cardapio-row-right">
                    <span className="cardapio-row-price">{formatCurrency(item.price)}</span>
                    <button
                      className={`cardapio-pill ${item.active ? 'on' : 'off'}`}
                      onClick={() => handleToggleActive(item)}
                    >
                      {item.active ? 'Disponível' : 'Indisponível'}
                    </button>
                    <button
                      className="btn-cardapio-edit"
                      onClick={() => { setEditItem(item); setModalOpen(true) }}
                      title="Editar"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      className="btn-cardapio-delete"
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
              ))}
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
    </div>
  )
}
