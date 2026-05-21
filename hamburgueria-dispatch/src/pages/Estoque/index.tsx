import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/auth/AuthBootstrap'
import type { InventoryItem, StockMovement, CatalogItem } from '../../types'
import './Estoque.css'

type Tab = 'stock' | 'movements' | 'recipes'
type CatalogOption = Pick<CatalogItem, 'id' | 'name'>

const UNITS = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'dz']

function formatQty(v: number, unit: string) {
  const s = Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
  return `${s} ${unit}`
}

// ── Stock status badge ────────────────────────────────────────────────────────

function StockBadge({ item }: { item: InventoryItem }) {
  if (item.quantity <= 0)
    return <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 600 }}>● Ruptura</span>
  if (item.quantity <= item.min_quantity)
    return <span style={{ color: '#f59e0b', fontSize: 11, fontWeight: 600 }}>● Crítico</span>
  return <span style={{ color: '#22c55e', fontSize: 11 }}>● OK</span>
}

// ── Item modal ────────────────────────────────────────────────────────────────

interface ItemFormState { name: string; unit: string; quantity: string; min_quantity: string }
const EMPTY_ITEM: ItemFormState = { name: '', unit: 'un', quantity: '0', min_quantity: '0' }

function parseNum(v: string) { const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? 0 : n }

function ItemModal({ open, item, onClose, onSave }: {
  open: boolean; item: InventoryItem | null
  onClose: () => void; onSave: (f: ItemFormState) => Promise<void>
}) {
  const [form, setForm]   = useState<ItemFormState>(EMPTY_ITEM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (open) setForm(item ? {
      name: item.name, unit: item.unit,
      quantity: String(item.quantity), min_quantity: String(item.min_quantity),
    } : EMPTY_ITEM)
    setError('')
  }, [open, item])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h)
  }, [onClose])

  if (!open) return null

  async function submit() {
    if (!form.name.trim()) { setError('Nome obrigatório'); return }
    setSaving(true); setError('')
    try { await onSave(form); onClose() }
    catch (e: any) { setError(e.message ?? 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>{item ? 'Editar insumo' : 'Novo insumo'}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <label>Nome *<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
          <label>Unidade
            <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label>Saldo inicial
            <input value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </label>
          <label>Nível mínimo (alerta)
            <input value={form.min_quantity} onChange={e => setForm(f => ({ ...f, min_quantity: e.target.value }))} />
          </label>
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Manual adjustment modal ───────────────────────────────────────────────────

function AdjustModal({ item, storeId, onClose, onDone }: {
  item: InventoryItem; storeId: string | null; onClose: () => void; onDone: () => void
}) {
  const [qty, setQty]     = useState('')
  const [type, setType]   = useState<'manual_in' | 'manual_out' | 'adjustment' | 'waste'>('manual_in')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  if (!item || !storeId) return null

  async function submit() {
    const amount = parseNum(qty)
    if (!amount) { setError('Quantidade inválida'); return }
    const signed = type === 'manual_out' || type === 'waste' ? -Math.abs(amount) : Math.abs(amount)
    setSaving(true); setError('')
    try {
      const { error: mvErr } = await supabase.from('stock_movements').insert({
        store_id: storeId, inventory_item_id: item.id,
        quantity: signed, movement_type: type,
        notes: notes.trim() || null, actor_type: 'operator',
      })
      if (mvErr) throw new Error(mvErr.message)
      await supabase.from('inventory_items')
        .update({ quantity: item.quantity + signed, updated_at: new Date().toISOString() })
        .eq('id', item.id)
      onDone(); onClose()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const typeLabels = { manual_in: 'Entrada', manual_out: 'Saída', adjustment: 'Ajuste', waste: 'Descarte' }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Ajuste — {item.name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
            Saldo atual: <strong style={{ color: '#ccc' }}>{formatQty(item.quantity, item.unit)}</strong>
          </p>
          <label>Tipo
            <select value={type} onChange={e => setType(e.target.value as typeof type)}>
              {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Quantidade ({item.unit})
            <input value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
          </label>
          <label>Observação
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional…" />
          </label>
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Salvando…' : 'Confirmar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Estoque() {
  const { storeId } = useAuth()
  const [tab, setTab]               = useState<Tab>('stock')
  const [items, setItems]           = useState<InventoryItem[]>([])
  const [movements, setMovements]   = useState<(StockMovement & { item_name?: string })[]>([])
  const [catalogs, setCatalogs]     = useState<CatalogOption[]>([])
  const [recipes, setRecipes]       = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editItem, setEditItem]     = useState<InventoryItem | null>(null)
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null)
  const channelRef                  = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const loadStock = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    const { data } = await supabase.from('inventory_items')
      .select('*').eq('store_id', storeId).order('name')
    setItems(data ?? [])
    setLoading(false)
  }, [storeId])

  const loadMovements = useCallback(async () => {
    if (!storeId) return
    const { data } = await supabase.from('stock_movements')
      .select('*, inventory_items(name)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(100)
    setMovements((data ?? []).map((m: any) => ({ ...m, item_name: m.inventory_items?.name })))
  }, [storeId])

  const loadRecipes = useCallback(async () => {
    if (!storeId) return
    const [{ data: recipeData }, { data: catData }] = await Promise.all([
      supabase.from('item_components').select('*, catalog_items(name), inventory_items(name, unit)').eq('store_id', storeId),
      supabase.from('catalog_items').select('id, name').eq('store_id', storeId).eq('active', true),
    ])
    setRecipes(recipeData ?? [])
    setCatalogs(catData ?? [])
  }, [storeId])

  useEffect(() => {
    if (!storeId) return
    loadStock()
    loadMovements()
    loadRecipes()

    channelRef.current = supabase.channel(`estoque-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `store_id=eq.${storeId}` }, loadStock)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements', filter: `store_id=eq.${storeId}` }, () => { loadMovements(); loadStock() })
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [storeId, loadStock, loadMovements, loadRecipes])

  async function saveItem(form: ItemFormState) {
    if (!storeId) return
    const payload = {
      store_id: storeId, name: form.name.trim(), unit: form.unit,
      quantity: parseNum(form.quantity), min_quantity: parseNum(form.min_quantity),
    }
    if (editItem) {
      const { error } = await supabase.from('inventory_items').update(payload).eq('id', editItem.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('inventory_items').insert(payload)
      if (error) throw new Error(error.message)
    }
    await loadStock()
  }

  async function deleteItem(id: string) {
    if (!confirm('Remover insumo? Movimentos serão preservados.')) return
    await supabase.from('inventory_items').delete().eq('id', id)
    await loadStock()
  }

  const criticalCount = items.filter(i => i.quantity <= i.min_quantity && i.quantity > 0).length
  const ruptureCount  = items.filter(i => i.quantity <= 0).length

  return (
    <div className="estoque-page">
      <div className="page-header">
        <h1>Estoque</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {ruptureCount > 0 && <span style={{ color: '#ef4444', fontSize: 12 }}>⚠ {ruptureCount} em ruptura</span>}
          {criticalCount > 0 && <span style={{ color: '#f59e0b', fontSize: 12 }}>⚠ {criticalCount} crítico(s)</span>}
          <button className="btn-primary" onClick={() => { setEditItem(null); setModalOpen(true) }}>+ Novo insumo</button>
        </div>
      </div>

      <div className="tab-bar">
        {(['stock', 'movements', 'recipes'] as Tab[]).map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {{ stock: 'Saldos', movements: 'Movimentos', recipes: 'Receitas' }[t]}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <div className="stock-table-wrapper">
          {loading ? <div className="loading">Carregando…</div> : (
            <table className="stock-table">
              <thead>
                <tr><th>Insumo</th><th>Unidade</th><th>Saldo</th><th>Mínimo</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className={item.quantity <= 0 ? 'row-rupture' : item.quantity <= item.min_quantity ? 'row-critical' : ''}>
                    <td>{item.name}</td>
                    <td>{item.unit}</td>
                    <td style={{ fontWeight: 600 }}>{formatQty(item.quantity, item.unit)}</td>
                    <td style={{ color: '#666' }}>{formatQty(item.min_quantity, item.unit)}</td>
                    <td><StockBadge item={item} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-sm" onClick={() => setAdjustItem(item)}>Ajustar</button>
                        <button className="btn-sm" onClick={() => { setEditItem(item); setModalOpen(true) }}>Editar</button>
                        <button className="btn-danger-sm" onClick={() => deleteItem(item.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: '#555', padding: 24 }}>Nenhum insumo cadastrado</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'movements' && (
        <div className="movements-list">
          {movements.map(m => {
            const isOut = m.quantity < 0
            const typeLabel: Record<string, string> = {
              sale: 'Venda', manual_in: 'Entrada', manual_out: 'Saída',
              adjustment: 'Ajuste', waste: 'Descarte',
            }
            return (
              <div key={m.id} className="movement-row">
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#ccc', fontSize: 13 }}>{m.item_name ?? '—'}</span>
                  <span style={{ color: '#666', fontSize: 11, marginLeft: 8 }}>{typeLabel[m.movement_type] ?? m.movement_type}</span>
                  {m.notes && <span style={{ color: '#555', fontSize: 11, marginLeft: 8 }}>— {m.notes}</span>}
                </div>
                <span style={{ color: isOut ? '#ef4444' : '#22c55e', fontWeight: 600, fontSize: 13 }}>
                  {isOut ? '' : '+'}{m.quantity}
                </span>
                <span style={{ color: '#555', fontSize: 11, marginLeft: 12 }}>
                  {new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )
          })}
          {!movements.length && <div className="empty-state">Nenhum movimento registrado</div>}
        </div>
      )}

      {tab === 'recipes' && (
        <RecipesTab storeId={storeId} items={items} catalogs={catalogs} recipes={recipes} onReload={loadRecipes} />
      )}

      <ItemModal open={modalOpen} item={editItem} onClose={() => setModalOpen(false)} onSave={saveItem} />

      {adjustItem && (
        <AdjustModal
          item={adjustItem} storeId={storeId}
          onClose={() => setAdjustItem(null)}
          onDone={() => { loadStock(); loadMovements() }}
        />
      )}
    </div>
  )
}

// ── Recipes tab ───────────────────────────────────────────────────────────────

function RecipesTab({ storeId, items, catalogs, recipes, onReload }: {
  storeId: string | null; items: InventoryItem[]
  catalogs: CatalogOption[]; recipes: any[]; onReload: () => void
}) {
  const [form, setForm]     = useState({ catalog_item_id: '', inventory_item_id: '', quantity_used: '' })
  const [saving, setSaving] = useState(false)

  async function addComponent() {
    if (!storeId || !form.catalog_item_id || !form.inventory_item_id) return
    const qty = parseFloat(form.quantity_used.replace(',', '.'))
    if (isNaN(qty) || qty <= 0) return
    setSaving(true)
    await supabase.from('item_components').insert({
      store_id: storeId, catalog_item_id: form.catalog_item_id,
      inventory_item_id: form.inventory_item_id, quantity_used: qty,
    })
    setForm(f => ({ ...f, quantity_used: '' })); setSaving(false); onReload()
  }

  async function removeComponent(id: string) {
    await supabase.from('item_components').delete().eq('id', id)
    onReload()
  }

  const itemMap = Object.fromEntries(items.map(i => [i.id, i]))
  const catMap  = Object.fromEntries(catalogs.map(c => [c.id, c]))

  return (
    <div style={{ padding: '20px 0' }}>
      <p style={{ color: '#888', fontSize: 12, marginBottom: 16 }}>
        Defina quais insumos são consumidos quando um item do cardápio é vendido.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={form.catalog_item_id} onChange={e => setForm(f => ({ ...f, catalog_item_id: e.target.value }))} style={{ flex: 2, minWidth: 150 }}>
          <option value="">— Item do cardápio —</option>
          {catalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={form.inventory_item_id} onChange={e => setForm(f => ({ ...f, inventory_item_id: e.target.value }))} style={{ flex: 2, minWidth: 150 }}>
          <option value="">— Insumo —</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
        </select>
        <input value={form.quantity_used} onChange={e => setForm(f => ({ ...f, quantity_used: e.target.value }))} placeholder="Qtd usada" style={{ width: 100 }} />
        <button className="btn-primary" onClick={addComponent} disabled={saving}>+ Adicionar</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: '#666', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px' }}>Item do cardápio</th>
            <th style={{ padding: '6px 8px' }}>Insumo</th>
            <th style={{ padding: '6px 8px' }}>Qtd / venda</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {recipes.map(r => {
            const inv = itemMap[r.inventory_item_id]
            return (
              <tr key={r.id} style={{ borderTop: '1px solid #222' }}>
                <td style={{ padding: '6px 8px', color: '#ccc' }}>{catMap[r.catalog_item_id]?.name ?? r.catalog_items?.name ?? '—'}</td>
                <td style={{ padding: '6px 8px', color: '#aaa' }}>{r.inventory_items?.name ?? inv?.name ?? '—'}</td>
                <td style={{ padding: '6px 8px', color: '#aaa' }}>{r.quantity_used} {r.inventory_items?.unit ?? inv?.unit ?? ''}</td>
                <td style={{ padding: '6px 8px' }}><button className="btn-danger-sm" onClick={() => removeComponent(r.id)}>✕</button></td>
              </tr>
            )
          })}
          {!recipes.length && (
            <tr><td colSpan={4} style={{ padding: 16, color: '#555', textAlign: 'center' }}>Nenhuma receita cadastrada</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
