import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthBootstrap'
import { fetchAddressByCep } from '../../lib/cep'
import type { DeliveryType, LogisticsType, OrderItem, Platform } from '../../types'
import { PLATFORM_COLORS, PLATFORM_LABELS_SHORT } from '../../lib/platformConfig'
import './OrderForm.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORMS: { key: Platform; label: string; color: string }[] = (
  Object.keys(PLATFORM_COLORS) as Platform[]
).map(key => ({ key, label: PLATFORM_LABELS_SHORT[key], color: PLATFORM_COLORS[key] }))

// ── Types ─────────────────────────────────────────────────────────────────────

interface ItemDraft {
  id: string
  name: string
  quantity: string
  unit_price: string
  notes: string
}

interface FormState {
  platform: Platform
  platform_order_code: string
  customer_name: string
  customer_phone: string
  address_street: string
  address_number: string
  address_complement: string
  address_neighborhood: string
  address_city: string
  address_zip: string
  payment_method: string
  delivery_type: DeliveryType
  logistics_type: LogisticsType
  items: ItemDraft[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcTotal(items: ItemDraft[]): number {
  return items.reduce((sum, it) => {
    const qty   = parseFloat(it.quantity)  || 0
    const price = parseFloat(it.unit_price) || 0
    return sum + qty * price
  }, 0)
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function uid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function emptyItem(): ItemDraft {
  return { id: uid(), name: '', quantity: '1', unit_price: '', notes: '' }
}

function normalizeOrder(form: FormState, storeId: string) {
  const items: OrderItem[] = form.items
    .filter(it => it.name.trim())
    .map(it => {
      const qty   = parseFloat(it.quantity)  || 1
      const price = parseFloat(it.unit_price) || 0
      return {
        name:        it.name.trim(),
        quantity:    qty,
        unit_price:  price,
        total_price: qty * price,
        notes:       it.notes.trim() || undefined,
      }
    })

  const total_amount = items.length > 0
    ? items.reduce((s, i) => s + i.total_price, 0)
    : 0

  // Determine initial status after normalization
  const hasDelivery  = form.delivery_type === 'delivery'
  const isOwnLogist  = form.logistics_type === 'own'
  const status       = (hasDelivery && isOwnLogist) ? 'awaiting_route' : 'normalized'
  const eligibility  = (hasDelivery && isOwnLogist) ? 'eligible' : 'external_monitoring'

  return {
    store_id:              storeId,
    platform:              form.platform,
    platform_order_id:     crypto.randomUUID(),
    platform_order_code:   form.platform_order_code.trim() || null,
    customer_name:         form.customer_name.trim(),
    customer_phone:        form.customer_phone.trim() || null,
    address_street:        form.address_street.trim(),
    address_number:        form.address_number.trim() || null,
    address_complement:    form.address_complement.trim() || null,
    address_neighborhood:  form.address_neighborhood.trim() || null,
    address_city:          form.address_city.trim() || null,
    address_zip:           form.address_zip.trim() || null,
    items,
    total_amount,
    payment_method:        form.payment_method.trim() || null,
    delivery_type:         form.delivery_type,
    logistics_type:        form.logistics_type,
    status,
    route_eligibility:     eligibility,
    rejection_count:       0,
    created_at:            new Date().toISOString(),
    updated_at:            new Date().toISOString(),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface OrderFormProps {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

const DEFAULT_FORM: FormState = {
  platform:            'ifood',
  platform_order_code: '',
  customer_name:       '',
  customer_phone:      '',
  address_street:      '',
  address_number:      '',
  address_complement:  '',
  address_neighborhood:'',
  address_city:        '',
  address_zip:         '',
  payment_method:      '',
  delivery_type:       'delivery',
  logistics_type:      'own',
  items:               [emptyItem()],
}

export default function OrderForm({ open, onClose, onCreated }: OrderFormProps) {
  const [visible, setVisible]   = useState(false)
  const [form, setForm]         = useState<FormState>(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError]     = useState<string | null>(null)
  const { storeId }             = useAuth()
  const firstInputRef           = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setForm(DEFAULT_FORM)
      setError(null)
      requestAnimationFrame(() => {
        setVisible(true)
        setTimeout(() => firstInputRef.current?.focus(), 250)
      })
    } else {
      setVisible(false)
    }
  }, [open])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // ── Field helpers ─────────────────────────────────────────────────────────

  function set(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleCepChange(raw: string) {
    set('address_zip', raw)
    setCepError(null)
    const digits = raw.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const result = await fetchAddressByCep(digits)
      setForm(f => ({
        ...f,
        address_street:       result.street,
        address_neighborhood: result.neighborhood,
        address_city:         result.city,
        address_number:       '',
      }))
    } catch (e) {
      setCepError(e instanceof Error ? e.message : 'CEP inválido')
    }
    setCepLoading(false)
  }

  function setItem(id: string, field: keyof ItemDraft, value: string) {
    setForm(f => ({
      ...f,
      items: f.items.map(it => it.id === id ? { ...it, [field]: value } : it),
    }))
  }

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))
  }

  function removeItem(id: string) {
    setForm(f => ({
      ...f,
      items: f.items.length > 1 ? f.items.filter(it => it.id !== id) : f.items,
    }))
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!form.customer_name.trim())  return 'Nome do cliente é obrigatório.'
    if (!form.address_street.trim()) return 'Rua é obrigatória.'
    if (form.items.every(it => !it.name.trim())) return 'Adicione pelo menos um item.'
    return null
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const err = validate()
    if (err) { setError(err); return }

    if (!storeId) { setError('Não foi possível identificar a loja.'); return }

    setSubmitting(true)
    setError(null)

    const payload = normalizeOrder(form, storeId)
    const { error: dbError } = await supabase.from('orders').insert(payload)

    setSubmitting(false)

    if (dbError) {
      setError('Erro ao salvar pedido: ' + dbError.message)
    } else {
      onCreated?.()
      onClose()
    }
  }

  if (!open && !visible) return null

  const total = calcTotal(form.items)

  return (
    <div className={`order-form-overlay ${visible ? 'open' : ''}`} onClick={onClose}>
      <div className="order-form-card" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="form-header">
          <span className="form-header-title">Novo pedido</span>
          <button className="form-close-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="13" y2="13"/>
              <line x1="13" y1="1" x2="1" y2="13"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="form-body">

          {/* Platform */}
          <div className="form-section">
            <span className="form-section-title">Plataforma</span>
            <div className="platform-picker">
              {PLATFORMS.map(p => (
                <button
                  key={p.key}
                  className={`platform-btn ${form.platform === p.key ? 'selected' : ''}`}
                  style={form.platform === p.key ? { borderColor: p.color, background: p.color + '18' } : {}}
                  onClick={() => set('platform', p.key)}
                  type="button"
                >
                  <span className="platform-btn-dot" style={{ background: p.color }} />
                  <span className="platform-btn-label">{p.label}</span>
                </button>
              ))}
            </div>
            <div className="form-group">
              <label className="form-label">Código do pedido (plataforma)</label>
              <input
                ref={firstInputRef}
                className="form-input"
                placeholder="ex: 12345 ou ABC-789"
                value={form.platform_order_code}
                onChange={e => set('platform_order_code', e.target.value)}
              />
            </div>
          </div>

          {/* Cliente */}
          <div className="form-section">
            <span className="form-section-title">Cliente</span>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input
                  className={`form-input ${error && !form.customer_name.trim() ? 'error' : ''}`}
                  placeholder="Nome completo"
                  value={form.customer_name}
                  onChange={e => set('customer_name', e.target.value)}
                />
              </div>
              <div className="form-group" style={{ maxWidth: 160 }}>
                <label className="form-label">Telefone</label>
                <input
                  className="form-input"
                  placeholder="(11) 9 0000-0000"
                  value={form.customer_phone}
                  onChange={e => set('customer_phone', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="form-section">
            <span className="form-section-title">Endereço de entrega</span>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Rua *</label>
                <input
                  className={`form-input ${error && !form.address_street.trim() ? 'error' : ''}`}
                  placeholder="Nome da rua / avenida"
                  value={form.address_street}
                  onChange={e => set('address_street', e.target.value)}
                />
              </div>
              <div className="form-group" style={{ maxWidth: 90 }}>
                <label className="form-label">Número</label>
                <input
                  className="form-input"
                  placeholder="123"
                  value={form.address_number}
                  onChange={e => set('address_number', e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Complemento</label>
                <input
                  className="form-input"
                  placeholder="Apto, bloco..."
                  value={form.address_complement}
                  onChange={e => set('address_complement', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Bairro</label>
                <input
                  className="form-input"
                  placeholder="Bairro"
                  value={form.address_neighborhood}
                  onChange={e => set('address_neighborhood', e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Cidade</label>
                <input
                  className="form-input"
                  placeholder="Cidade"
                  value={form.address_city}
                  onChange={e => set('address_city', e.target.value)}
                />
              </div>
              <div className="form-group" style={{ maxWidth: 130 }}>
                <label className="form-label">CEP</label>
                <input
                  className={`form-input ${cepError ? 'error' : ''}`}
                  placeholder="00000-000"
                  value={form.address_zip}
                  onChange={e => handleCepChange(e.target.value)}
                />
                {cepLoading && <span className="form-cep-hint">Buscando...</span>}
                {cepError   && <span className="form-cep-error">{cepError}</span>}
              </div>
            </div>
          </div>

          {/* Itens */}
          <div className="form-section">
            <span className="form-section-title">Itens do pedido</span>
            <div className="form-items">
              {/* Column labels */}
              <div className="form-item-row" style={{ marginBottom: -4 }}>
                <span className="form-label" style={{ flex: 1 }}>Item</span>
                <span className="form-label form-item-qty">Qtd</span>
                <span className="form-label form-item-price">Valor unit.</span>
                <span style={{ width: 30 }} />
              </div>
              {form.items.map(it => (
                <div key={it.id} className="form-item-row">
                  <input
                    className="form-input"
                    placeholder="Nome do item"
                    value={it.name}
                    onChange={e => setItem(it.id, 'name', e.target.value)}
                  />
                  <input
                    className="form-input form-item-qty"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={it.quantity}
                    onChange={e => setItem(it.id, 'quantity', e.target.value)}
                  />
                  <input
                    className="form-input form-item-price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={it.unit_price}
                    onChange={e => setItem(it.id, 'unit_price', e.target.value)}
                  />
                  <button
                    className="form-item-remove"
                    onClick={() => removeItem(it.id)}
                    type="button"
                    tabIndex={-1}
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="1" y1="1" x2="13" y2="13"/>
                      <line x1="13" y1="1" x2="1" y2="13"/>
                    </svg>
                  </button>
                </div>
              ))}
              <button className="btn-add-item" onClick={addItem} type="button">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Adicionar item
              </button>
            </div>
          </div>

          {/* Pagamento + Tipo */}
          <div className="form-section">
            <span className="form-section-title">Pagamento e entrega</span>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Forma de pagamento</label>
                <select
                  className="form-select"
                  value={form.payment_method}
                  onChange={e => set('payment_method', e.target.value)}
                >
                  <option value="">Selecionar</option>
                  <option value="pix">PIX</option>
                  <option value="credit_card">Cartão de crédito</option>
                  <option value="debit_card">Cartão de débito</option>
                  <option value="cash">Dinheiro</option>
                  <option value="online">Pago online</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo de entrega</label>
                <div className="toggle-group">
                  {(['delivery', 'pickup'] as const).map(t => (
                    <button
                      key={t}
                      className={`toggle-btn ${form.delivery_type === t ? 'active' : ''}`}
                      onClick={() => set('delivery_type', t)}
                      type="button"
                    >
                      {t === 'delivery' ? 'Delivery' : 'Retirada'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Logística</label>
                <div className="toggle-group">
                  {(['own', 'platform'] as const).map(l => (
                    <button
                      key={l}
                      className={`toggle-btn ${form.logistics_type === l ? 'active' : ''}`}
                      onClick={() => set('logistics_type', l)}
                      type="button"
                    >
                      {l === 'own' ? 'Própria' : 'Plataforma'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {form.delivery_type === 'delivery' && form.logistics_type === 'own' && (
              <div style={{ fontSize: 11, color: '#27AE60', display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Pedido entrará na fila de roteamento automaticamente
              </div>
            )}
          </div>

          {/* Error */}
          {error && <div className="form-error-msg">{error}</div>}

        </div>

        {/* Footer */}
        <div className="form-footer">
          <div className="form-total-preview">
            Total: <strong>{formatCurrency(total)}</strong>
          </div>
          <div className="form-footer-actions">
            <button className="btn-form-cancel" onClick={onClose}>Cancelar</button>
            <button
              className="btn-form-submit"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Salvando...' : 'Criar pedido'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
