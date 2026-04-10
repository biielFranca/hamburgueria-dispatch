import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { syncIfood } from '../../lib/ifood'
import { playAlert } from '../../lib/alertSound'
import './Dev.css'

const NAMES = ['João Silva', 'Maria Souza', 'Carlos Oliveira', 'Ana Costa', 'Pedro Santos', 'Lucia Ferreira']
const STREETS = ['Rua das Flores', 'Av. Paulista', 'Rua Oscar Freire', 'Rua Augusta', 'Alameda Santos']
const HOODS = ['Centro', 'Jardins', 'Vila Madalena', 'Moema', 'Pinheiros']
const PAYMENTS = ['pix', 'credit_card', 'debit_card', 'cash']

const ITEM_SETS = [
  [{ name: 'X-Burguer', quantity: 1, unit_price: 32.9, total_price: 32.9 }, { name: 'Fritas M', quantity: 1, unit_price: 12, total_price: 12 }],
  [{ name: 'X-Bacon', quantity: 2, unit_price: 38, total_price: 76 }],
  [
    { name: 'X-Tudo', quantity: 1, unit_price: 45, total_price: 45 },
    { name: 'Onion Rings', quantity: 1, unit_price: 15, total_price: 15 },
    { name: 'Coca-Cola', quantity: 2, unit_price: 8, total_price: 16 },
  ],
  [{ name: 'Smash Duplo', quantity: 1, unit_price: 52, total_price: 52 }, { name: 'Milkshake', quantity: 1, unit_price: 22, total_price: 22 }],
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function mockOrder(storeId: string, type: 'own' | 'platform' | 'pickup') {
  const isTakeout = type === 'pickup'
  const isOwn = type === 'own'
  const items = pick(ITEM_SETS)
  const total = items.reduce((s, i) => s + i.total_price, 0)

  return {
    store_id: storeId,
    platform: 'ifood',
    platform_order_id: `test-${crypto.randomUUID()}`,
    platform_order_code: `#${Math.floor(Math.random() * 9000 + 1000)}`,
    customer_name: pick(NAMES),
    customer_phone: `119${Math.floor(Math.random() * 90_000_000 + 10_000_000)}`,
    address_street: isTakeout ? '' : pick(STREETS),
    address_number: isTakeout ? null : String(Math.floor(Math.random() * 999 + 1)),
    address_neighborhood: isTakeout ? null : pick(HOODS),
    address_city: isTakeout ? null : 'São Paulo',
    address_zip: isTakeout ? null : '01310-100',
    latitude: isTakeout ? null : -23.5505 + (Math.random() - 0.5) * 0.05,
    longitude: isTakeout ? null : -46.6333 + (Math.random() - 0.5) * 0.05,
    items,
    total_amount: total,
    payment_method: pick(PAYMENTS),
    delivery_type: isTakeout ? 'pickup' : 'delivery',
    logistics_type: isOwn ? 'own' : 'platform',
    status: isOwn && !isTakeout ? 'awaiting_route' : 'normalized',
    route_eligibility: isOwn && !isTakeout ? 'eligible' : 'external_monitoring',
    rejection_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

type BtnState = 'idle' | 'loading' | 'ok' | 'error'
interface BtnStatus {
  state: BtnState
  msg: string
}
const IDLE: BtnStatus = { state: 'idle', msg: '' }

export default function Dev() {
  const storeIdRef = useRef<string | null>(null)

  const [ownBtn, setOwnBtn] = useState<BtnStatus>(IDLE)
  const [platformBtn, setPlatformBtn] = useState<BtnStatus>(IDLE)
  const [pickupBtn, setPickupBtn] = useState<BtnStatus>(IDLE)
  const [ifoodBtn, setIfoodBtn] = useState<BtnStatus>(IDLE)
  const [clearBtn, setClearBtn] = useState<BtnStatus>(IDLE)
  const [alarmBtn, setAlarmBtn] = useState<BtnStatus>(IDLE)
  const [testCount, setTestCount] = useState<number | null>(null)

  useEffect(() => {
    async function init() {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return
      const { data } = await supabase
        .from('users')
        .select('store_id')
        .eq('auth_id', auth.user.id)
        .single()
      if (data) {
        storeIdRef.current = data.store_id
        refreshCount(data.store_id)
      }
    }
    init()
  }, [])

  async function refreshCount(sid?: string) {
    const storeId = sid ?? storeIdRef.current
    if (!storeId) return
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .ilike('platform_order_id', 'test-%')
    setTestCount(count ?? 0)
  }

  async function insertOrder(type: 'own' | 'platform' | 'pickup', set: (s: BtnStatus) => void) {
    if (!storeIdRef.current) {
      set({ state: 'error', msg: 'store_id não resolvido' })
      return
    }
    set({ state: 'loading', msg: '' })
    const payload = mockOrder(storeIdRef.current, type)
    const { error } = await supabase.from('orders').insert(payload)
    if (error) {
      set({ state: 'error', msg: error.message })
    } else {
      const label =
        type === 'own'
          ? `${payload.platform_order_code} - entrega própria -> fila de despacho`
          : type === 'platform'
          ? `${payload.platform_order_code} - entrega plataforma -> monitoramento`
          : `${payload.platform_order_code} - retirada`
      set({ state: 'ok', msg: label })
      refreshCount()
    }
    setTimeout(() => set(IDLE), 4000)
  }

  async function handleTestIfood() {
    if (!storeIdRef.current) {
      setIfoodBtn({ state: 'error', msg: 'store_id não resolvido' })
      return
    }
    setIfoodBtn({ state: 'loading', msg: '' })
    try {
      const result = await syncIfood(storeIdRef.current)
      setIfoodBtn({
        state: 'ok',
        msg: `Sync executada - ${result.events} evento(s), ${result.inserted} inserido(s)`,
      })
    } catch (e) {
      setIfoodBtn({ state: 'error', msg: e instanceof Error ? e.message : String(e) })
    }
    setTimeout(() => setIfoodBtn(IDLE), 5000)
  }

  function handleAlarm(level: '5min' | '1min' | 'critical') {
    playAlert(level)
    setAlarmBtn({ state: 'ok', msg: `Som "${level}" tocado` })
    setTimeout(() => setAlarmBtn(IDLE), 2000)
  }

  async function handleClear() {
    if (!storeIdRef.current) return
    setClearBtn({ state: 'loading', msg: '' })
    const { error, count } = await supabase
      .from('orders')
      .delete({ count: 'exact' })
      .eq('store_id', storeIdRef.current)
      .ilike('platform_order_id', 'test-%')

    if (error) {
      setClearBtn({ state: 'error', msg: error.message })
    } else {
      setClearBtn({ state: 'ok', msg: `${count ?? 0} pedido(s) removido(s)` })
      setTestCount(0)
    }
    setTimeout(() => setClearBtn(IDLE), 3000)
  }

  return (
    <div className="dev-panel">
      <div className="dev-header">
        <h1>Dev / Testes</h1>
        <span className="dev-badge">AMBIENTE DE DESENVOLVIMENTO</span>
      </div>

      <section className="dev-section">
        <div className="dev-section-title">Simular pedido iFood</div>
        <div className="dev-section-desc">
          Insere um pedido fake diretamente no banco com dados aleatórios.
          <br />
          <span style={{ color: '#555' }}>
            platform_order_id começa com <code>test-</code> para fácil remoção.
          </span>
        </div>

        <div className="dev-btn-row">
          <DevButton
            label="Entrega própria"
            desc="-> fila de despacho"
            color="#27AE60"
            status={ownBtn}
            onClick={() => insertOrder('own', setOwnBtn)}
          />
          <DevButton
            label="Entrega plataforma"
            desc="-> monitoramento externo"
            color="#F5A623"
            status={platformBtn}
            onClick={() => insertOrder('platform', setPlatformBtn)}
          />
          <DevButton
            label="Retirada"
            desc="-> pickup"
            color="#8B5CF6"
            status={pickupBtn}
            onClick={() => insertOrder('pickup', setPickupBtn)}
          />
        </div>
      </section>

      <section className="dev-section">
        <div className="dev-section-title">Integração iFood</div>
        <div className="dev-section-desc">
          Chama a edge function <code>ifood-sync</code> usando somente o <code>store_id</code>.
        </div>
        <div className="dev-btn-row">
          <DevButton
            label="Executar sync iFood"
            desc="-> busca eventos e valida conexão"
            color="#EA1D2C"
            status={ifoodBtn}
            onClick={handleTestIfood}
          />
        </div>
      </section>

      <section className="dev-section">
        <div className="dev-section-title">Testar alarmes</div>
        <div className="dev-section-desc">
          Dispara os sons de alerta para verificar volume e tom. O botão mute (canto inferior direito) é respeitado.
        </div>
        <div className="dev-btn-row">
          <DevButton
            label="Aviso (5 min)"
            desc="-> tom leve"
            color="#facc15"
            status={alarmBtn}
            onClick={() => handleAlarm('5min')}
          />
          <DevButton
            label="Urgente (1 min)"
            desc="-> tom médio"
            color="#fb923c"
            status={alarmBtn}
            onClick={() => handleAlarm('1min')}
          />
          <DevButton
            label="Crítico (atrasado)"
            desc="-> tom forte"
            color="#ef4444"
            status={alarmBtn}
            onClick={() => handleAlarm('critical')}
          />
        </div>
      </section>

      <section className="dev-section">
        <div className="dev-section-title">
          Limpar pedidos de teste
          {testCount !== null && <span className="dev-count">{testCount} no banco</span>}
        </div>
        <div className="dev-section-desc">
          Remove todos os pedidos com <code>platform_order_id LIKE 'test-%'</code> da sua loja.
        </div>
        <div className="dev-btn-row">
          <DevButton
            label="Limpar pedidos de teste"
            desc={testCount ? `${testCount} pedido(s) a remover` : 'nenhum pedido de teste'}
            color="#ef4444"
            status={clearBtn}
            onClick={handleClear}
            disabled={testCount === 0}
          />
        </div>
      </section>
    </div>
  )
}

function DevButton({
  label,
  desc,
  color,
  status,
  onClick,
  disabled = false,
}: {
  label: string
  desc: string
  color: string
  status: BtnStatus
  onClick: () => void
  disabled?: boolean
}) {
  const isLoading = status.state === 'loading'

  return (
    <div className="dev-btn-wrapper">
      <button
        className={`dev-btn dev-btn-${status.state}`}
        style={{ '--btn-color': color } as React.CSSProperties}
        onClick={onClick}
        disabled={isLoading || disabled}
      >
        <span className="dev-btn-dot" />
        <span className="dev-btn-label">{isLoading ? 'Aguarde...' : label}</span>
        <span className="dev-btn-desc">{desc}</span>
      </button>
      {status.msg && (
        <div className={`dev-result dev-result-${status.state}`}>
          {status.state === 'ok' ? '✓' : '✗'} {status.msg}
        </div>
      )}
    </div>
  )
}
