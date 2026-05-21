import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/auth/AuthBootstrap'
import type { CatalogItem, CatalogCategory, ItemAvailabilityState } from '../../types'
import './Cardapio.css'

type Tab = 'items' | 'categories' | 'mappings'

interface CatalogItemRow extends CatalogItem {
  category?: CatalogCategory
  availability?: ItemAvailabilityState
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

// ── Availability badge ────────────────────────────────────────────────────────

function AvailBadge({ avail }: { avail?: ItemAvailabilityState }) {
  if (!avail || avail.available) {
    return <span style={{ color: '#22c55e', fontSize: 11 }}>● Disponível</span>
  }
  const label = avail.reason === 'stock_rupture' ? 'Ruptura' : avail.reason === 'manual_pause' ? 'Pausado' : 'Indisponível'
  return <span style={{ color: '#ef4444', fontSize: 11 }}>● {label}</span>
}

// ── Item form modal ───────────────────────────────────────────────────────────

interface ItemFormState {
  name: string; description: string; price: string
  category_id: string; active: boolean
}

const EMPTY_ITEM: ItemFormState = { name: '', description: '', price: '', category_id: '', active: true }

function ItemModal({
  open, item, categories, onClose, onSave,
}: {
  open: boolean; item: CatalogItemRow | null
  categories: CatalogCategory[]
  onClose: () => void
  onSave: (f: ItemFormState) => Promise<void>
}) {
  const [form, setForm]   = useState<ItemFormState>(EMPTY_ITEM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (open) setForm(item ? {
      name: item.name, description: item.description ?? '',
      price: item.price.toFixed(2).replace('.', ','),
      category_id: item.category_id ?? '', active: item.active,
    } : EMPTY_ITEM)
    setError('')
  }, [open, item])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  if (!open) return null

  async function submit() {
    if (!form.name.trim()) { setError('Nome obrigatório'); return }
    const price = parseFloat(form.price.replace(',', '.'))
    if (isNaN(price) || price < 0) { setError('Preço inválido'); return }
    setSaving(true); setError('')
    try { await onSave({ ...form, price: String(price) }); onClose() }
    catch (e: any) { setError(e.message ?? 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>{item ? 'Editar item' : 'Novo item'}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <label>Nome *
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </label>
          <label>Descrição
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </label>
          <label>Preço *
            <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0,00" />
          </label>
          <label>Categoria
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
              <option value="">— Sem categoria —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
            Item ativo
          </label>
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Aliases panel ─────────────────────────────────────────────────────────────

function AliasPanel({ item, onClose }: { item: CatalogItemRow; onClose: () => void }) {
  const [aliases, setAliases] = useState<{ id: string; alias: string }[]>([])
  const [newAlias, setNewAlias] = useState('')
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    supabase.from('catalog_item_aliases')
      .select('id, alias').eq('catalog_item_id', item.id)
      .then(({ data }) => setAliases(data ?? []))
  }, [item.id])

  async function addAlias() {
    if (!newAlias.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('catalog_item_aliases')
      .insert({ catalog_item_id: item.id, store_id: item.store_id, alias: newAlias.trim() })
      .select('id, alias').single()
    if (!error && data) { setAliases(prev => [...prev, data]); setNewAlias('') }
    setSaving(false)
  }

  async function removeAlias(id: string) {
    await supabase.from('catalog_item_aliases').delete().eq('id', id)
    setAliases(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Aliases — {item.name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
            Nomes alternativos usados pelas plataformas para identificar este item automaticamente.
          </p>
          {aliases.map(a => (
            <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ flex: 1, color: '#ccc', fontSize: 13 }}>{a.alias}</span>
              <button className="btn-danger-sm" onClick={() => removeAlias(a.id)}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={newAlias} onChange={e => setNewAlias(e.target.value)}
              placeholder="Novo alias…" style={{ flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') addAlias() }}
            />
            <button className="btn-primary" onClick={addAlias} disabled={saving}>+</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Cardapio() {
  const { storeId } = useAuth()
  const [tab, setTab]           = useState<Tab>('items')
  const [items, setItems]       = useState<CatalogItemRow[]>([])
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [loading, setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<CatalogItemRow | null>(null)
  const [aliasItem, setAliasItem] = useState<CatalogItemRow | null>(null)
  const [search, setSearch]     = useState('')
  const channelRef              = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const loadData = useCallback(async () => {
    if (!storeId) return
    setLoading(true)

    const [{ data: cats }, { data: rawItems }, { data: avail }] = await Promise.all([
      supabase.from('catalog_categories').select('*').eq('store_id', storeId).order('sort_order'),
      supabase.from('catalog_items').select('*').eq('store_id', storeId).order('name'),
      supabase.from('item_availability_state').select('*').eq('store_id', storeId),
    ])

    setCategories(cats ?? [])
    const catMap = Object.fromEntries((cats ?? []).map(c => [c.id, c]))
    const availMap = Object.fromEntries((avail ?? []).map((a: ItemAvailabilityState) => [a.catalog_item_id, a]))

    setItems((rawItems ?? []).map((it: CatalogItem) => ({
      ...it,
      category:     catMap[it.category_id ?? ''],
      availability: availMap[it.id],
    })))
    setLoading(false)
  }, [storeId])

  useEffect(() => {
    if (!storeId) return
    loadData()

    channelRef.current = supabase.channel(`cardapio-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_items', filter: `store_id=eq.${storeId}` }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_availability_state', filter: `store_id=eq.${storeId}` }, loadData)
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [storeId, loadData])

  async function saveItem(form: ItemFormState) {
    if (!storeId) return
    const price = parseFloat(form.price.replace(',', '.'))
    const payload = {
      store_id:    storeId,
      name:        form.name.trim(),
      description: form.description.trim() || null,
      price,
      category_id: form.category_id || null,
      active:      form.active,
    }
    if (editItem) {
      const { error } = await supabase.from('catalog_items').update(payload).eq('id', editItem.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('catalog_items').insert(payload)
      if (error) throw new Error(error.message)
    }
    await loadData()
  }

  async function toggleAvailability(item: CatalogItemRow) {
    if (!storeId) return
    const current = item.availability?.available ?? true
    await supabase.from('item_availability_state')
      .upsert({
        catalog_item_id: item.id, store_id: storeId,
        available: !current, reason: current ? 'manual_pause' : null, updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id,catalog_item_id' })
    await loadData()
  }

  async function deleteItem(id: string) {
    if (!confirm('Remover item do catálogo?')) return
    await supabase.from('catalog_items').delete().eq('id', id)
    await loadData()
  }

  const filtered = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="cardapio-page">
      <div className="page-header">
        <h1>Cardápio</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="search-input"
            placeholder="Buscar item…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn-primary" onClick={() => { setEditItem(null); setModalOpen(true) }}>
            + Novo item
          </button>
        </div>
      </div>

      <div className="tab-bar">
        {(['items', 'categories', 'mappings'] as Tab[]).map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {{ items: 'Itens', categories: 'Categorias', mappings: 'Plataformas' }[t]}
          </button>
        ))}
      </div>

      {tab === 'items' && (
        <>
          {loading ? (
            <div className="loading">Carregando…</div>
          ) : (
            <div className="items-grid">
              {filtered.map(item => (
                <div key={item.id} className={`item-card ${!item.active ? 'inactive' : ''}`}>
                  <div className="item-card-header">
                    <span className="item-name">{item.name}</span>
                    <span className="item-price">{formatCurrency(item.price)}</span>
                  </div>
                  {item.category && (
                    <span className="item-category">{item.category.name}</span>
                  )}
                  {item.description && (
                    <p className="item-description">{item.description}</p>
                  )}
                  <div className="item-footer">
                    <AvailBadge avail={item.availability} />
                    <div className="item-actions">
                      <button className="btn-sm" onClick={() => toggleAvailability(item)}>
                        {(item.availability?.available ?? true) ? 'Pausar' : 'Ativar'}
                      </button>
                      <button className="btn-sm" onClick={() => setAliasItem(item)}>Aliases</button>
                      <button className="btn-sm" onClick={() => { setEditItem(item); setModalOpen(true) }}>Editar</button>
                      <button className="btn-danger-sm" onClick={() => deleteItem(item.id)}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
              {!filtered.length && !loading && (
                <div className="empty-state">Nenhum item encontrado</div>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'categories' && (
        <CategoriesTab storeId={storeId} categories={categories} onReload={loadData} />
      )}

      {tab === 'mappings' && (
        <MappingsTab storeId={storeId} items={items} />
      )}

      <ItemModal
        open={modalOpen}
        item={editItem}
        categories={categories}
        onClose={() => setModalOpen(false)}
        onSave={saveItem}
      />

      {aliasItem && (
        <AliasPanel item={aliasItem} onClose={() => setAliasItem(null)} />
      )}
    </div>
  )
}

// ── Categories tab ────────────────────────────────────────────────────────────

function CategoriesTab({ storeId, categories, onReload }: {
  storeId: string | null; categories: CatalogCategory[]; onReload: () => void
}) {
  const [name, setName]     = useState('')
  const [saving, setSaving] = useState(false)

  async function addCategory() {
    if (!storeId || !name.trim()) return
    setSaving(true)
    await supabase.from('catalog_categories').insert({ store_id: storeId, name: name.trim(), sort_order: categories.length })
    setName(''); setSaving(false); onReload()
  }

  async function deleteCategory(id: string) {
    if (!confirm('Remover categoria? Itens não serão apagados.')) return
    await supabase.from('catalog_categories').delete().eq('id', id)
    onReload()
  }

  return (
    <div style={{ padding: '20px 0', maxWidth: 400 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={name} onChange={e => setName(e.target.value)} placeholder="Nome da categoria…"
          onKeyDown={e => { if (e.key === 'Enter') addCategory() }} style={{ flex: 1 }}
        />
        <button className="btn-primary" onClick={addCategory} disabled={saving}>+ Adicionar</button>
      </div>
      {categories.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #222' }}>
          <span style={{ flex: 1, color: '#ccc' }}>{c.name}</span>
          <button className="btn-danger-sm" onClick={() => deleteCategory(c.id)}>✕</button>
        </div>
      ))}
      {!categories.length && <div className="empty-state">Nenhuma categoria</div>}
    </div>
  )
}

// ── Platform mappings tab ─────────────────────────────────────────────────────

function MappingsTab({ storeId, items }: { storeId: string | null; items: CatalogItemRow[] }) {
  const [mappings, setMappings] = useState<any[]>([])
  const [form, setForm]         = useState({ catalog_item_id: '', platform: 'ifood', external_code: '', external_name: '' })
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (!storeId) return
    supabase.from('platform_item_mapping').select('*').eq('store_id', storeId)
      .then(({ data }) => setMappings(data ?? []))
  }, [storeId])

  async function addMapping() {
    if (!storeId || !form.catalog_item_id || !form.external_code.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('platform_item_mapping')
      .insert({ ...form, store_id: storeId }).select().single()
    if (!error && data) setMappings(prev => [...prev, data])
    setSaving(false)
  }

  async function removeMapping(id: string) {
    await supabase.from('platform_item_mapping').delete().eq('id', id)
    setMappings(prev => prev.filter(m => m.id !== id))
  }

  const itemMap = Object.fromEntries(items.map(i => [i.id, i.name]))

  return (
    <div style={{ padding: '20px 0' }}>
      <p style={{ color: '#888', fontSize: 12, marginBottom: 16 }}>
        Vincule o código externo da plataforma ao item do catálogo interno para baixa automática de estoque.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={form.catalog_item_id} onChange={e => setForm(f => ({ ...f, catalog_item_id: e.target.value }))} style={{ flex: 2, minWidth: 160 }}>
          <option value="">— Item do catálogo —</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} style={{ width: 110 }}>
          {['ifood', '99food', 'keeta'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input value={form.external_code} onChange={e => setForm(f => ({ ...f, external_code: e.target.value }))} placeholder="Código externo" style={{ flex: 1, minWidth: 120 }} />
        <input value={form.external_name} onChange={e => setForm(f => ({ ...f, external_name: e.target.value }))} placeholder="Nome na plataforma (opcional)" style={{ flex: 1, minWidth: 150 }} />
        <button className="btn-primary" onClick={addMapping} disabled={saving}>+ Mapear</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: '#666', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px' }}>Item interno</th>
            <th style={{ padding: '6px 8px' }}>Plataforma</th>
            <th style={{ padding: '6px 8px' }}>Código externo</th>
            <th style={{ padding: '6px 8px' }}>Nome plataforma</th>
            <th style={{ padding: '6px 8px' }}></th>
          </tr>
        </thead>
        <tbody>
          {mappings.map(m => (
            <tr key={m.id} style={{ borderTop: '1px solid #222' }}>
              <td style={{ padding: '6px 8px', color: '#ccc' }}>{itemMap[m.catalog_item_id] ?? m.catalog_item_id.slice(0, 8)}</td>
              <td style={{ padding: '6px 8px', color: '#aaa' }}>{m.platform}</td>
              <td style={{ padding: '6px 8px', color: '#aaa' }}>{m.external_code}</td>
              <td style={{ padding: '6px 8px', color: '#666' }}>{m.external_name ?? '—'}</td>
              <td style={{ padding: '6px 8px' }}><button className="btn-danger-sm" onClick={() => removeMapping(m.id)}>✕</button></td>
            </tr>
          ))}
          {!mappings.length && (
            <tr><td colSpan={5} style={{ padding: 16, color: '#555', textAlign: 'center' }}>Nenhum mapeamento</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
