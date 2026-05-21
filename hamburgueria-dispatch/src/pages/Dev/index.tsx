import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/auth/AuthBootstrap'
import { syncIfood } from '../../lib/ifood'
import { playAlert } from '../../lib/alertSound'
import { runRouteEngine } from '../../lib/routeEngine'
import type { RouteEngineResult } from '../../lib/routeEngine'
import type { Order } from '../../types'
import './Dev.css'

const NAMES = ['João Silva', 'Maria Souza', 'Carlos Oliveira', 'Ana Costa', 'Pedro Santos', 'Lucia Ferreira', 'Fernanda Lima', 'Rafael Mendes']
const PAYMENTS = ['pix', 'credit_card', 'debit_card', 'cash']
const TEST_PLATFORMS = ['ifood', '99food', 'keeta'] as const

function platformLabel(platform: (typeof TEST_PLATFORMS)[number]) {
  if (platform === 'ifood') return 'iFood'
  if (platform === '99food') return '99Food'
  return 'Keeta'
}

const ADDRESSES = [
  // Vila Nova Cachoeirinha (ao redor da loja)
  { street: 'Av. Inajar de Souza',              number: '1200', hood: 'Vila Nova Cachoeirinha', zip: '02424-000', lat: -23.4672, lng: -46.6738 },
  { street: 'Rua Coronel Melo de Oliveira',     number: '540',  hood: 'Vila Nova Cachoeirinha', zip: '02431-020', lat: -23.4698, lng: -46.6712 },
  { street: 'Rua Domitila',                     number: '87',   hood: 'Vila Nova Cachoeirinha', zip: '02435-010', lat: -23.4654, lng: -46.6755 },
  { street: 'Rua Nossa Senhora de Fátima',      number: '310',  hood: 'Vila Nova Cachoeirinha', zip: '02438-000', lat: -23.4640, lng: -46.6700 },
  // Brasilândia (norte, dentro da área visível)
  { street: 'Rua Deputado Laércio Corte',       number: '420',  hood: 'Brasilândia',            zip: '02850-000', lat: -23.4348, lng: -46.6901 },
  { street: 'Av. Raimundo Pereira de Magalhães',number: '2000', hood: 'Brasilândia',            zip: '02802-000', lat: -23.4302, lng: -46.6852 },
  { street: 'Rua Jaguaré',                      number: '740',  hood: 'Brasilândia',            zip: '02860-010', lat: -23.4380, lng: -46.6938 },
  // Cachoeirinha (oeste, até a linha da Av. Otaviano Alves de Lima)
  { street: 'Rua Otávio Tarquínio de Sousa',    number: '180',  hood: 'Cachoeirinha',           zip: '02442-000', lat: -23.4710, lng: -46.6831 },
  { street: 'Av. Otaviano Alves de Lima',       number: '950',  hood: 'Cachoeirinha',           zip: '02450-000', lat: -23.4680, lng: -46.6870 },
  // Mandaqui (leste)
  { street: 'Av. Mandaqui',                     number: '630',  hood: 'Mandaqui',               zip: '02401-000', lat: -23.4685, lng: -46.6228 },
  { street: 'Rua Voluntários da Pátria',        number: '4200', hood: 'Mandaqui',               zip: '02402-000', lat: -23.4660, lng: -46.6255 },
  // Casa Verde / Limão (sul, acima do Tietê)
  { street: 'Av. Casa Verde',                   number: '1540', hood: 'Casa Verde',             zip: '02519-001', lat: -23.5028, lng: -46.6643 },
  { street: 'Rua Camargo',                      number: '210',  hood: 'Limão',                  zip: '02525-010', lat: -23.4971, lng: -46.6498 },
]

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

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function newId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function mockOrder(storeId: string, type: 'own' | 'platform' | 'pickup', prepMinutes = 20) {
  const isTakeout = type === 'pickup'
  const isOwn = type === 'own'
  const platform = pick(TEST_PLATFORMS)
  const items = pick(ITEM_SETS)
  const total = items.reduce((s, i) => s + i.total_price, 0)

  return {
    store_id: storeId,
    platform,
    platform_order_id: `test-${newId()}`,
    platform_order_code: `#${Math.floor(Math.random() * 9000 + 1000)}`,
    customer_name: pick(NAMES),
    customer_phone: `119${Math.floor(Math.random() * 90_000_000 + 10_000_000)}`,
    ...(() => {
      if (isTakeout) return {
        address_street: '', address_number: null, address_neighborhood: null,
        address_city: null, address_zip: null, latitude: null, longitude: null,
      }
      const addr = pick(ADDRESSES)
      return {
        address_street:       addr.street,
        address_number:       addr.number,
        address_neighborhood: addr.hood,
        address_city:         'São Paulo',
        address_zip:          addr.zip,
        latitude:             addr.lat + (Math.random() - 0.5) * 0.002,
        longitude:            addr.lng + (Math.random() - 0.5) * 0.002,
      }
    })(),
    items,
    total_amount: total,
    payment_method: pick(PAYMENTS),
    delivery_type: isTakeout ? 'pickup' : 'delivery',
    logistics_type: isOwn ? 'own' : 'platform',
    // estimated_delivery_at: now + prepMinutes (always ≤ 25 min → classifier rule 5 never blocks)
    estimated_delivery_at: isTakeout
      ? null
      : new Date(Date.now() + prepMinutes * 60_000).toISOString(),
    // All orders start as 'normalized' so the classifier does a meaningful UPDATE
    // to 'awaiting_route', which triggers the route engine via Realtime.
    status: 'normalized',
    route_eligibility: isTakeout ? 'blocked' : isOwn ? 'awaiting' : 'external_monitoring',
    rejection_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type BtnState = 'idle' | 'loading' | 'ok' | 'error'
interface BtnStatus { state: BtnState; msg: string }
const IDLE: BtnStatus = { state: 'idle', msg: '' }

type LogLevel = 'info' | 'ok' | 'warn' | 'error'
interface LogEntry { id: string; ts: Date; level: LogLevel; msg: string }

const MAX_LOG = 80

// ── Helpers ───────────────────────────────────────────────────────────────────

const PREFIX_CLASS: Record<string, string> = {
  '[classifier]':   'log-prefix-classifier',
  '[geocoder]':     'log-prefix-geocoder',
  '[route-engine]': 'log-prefix-engine',
  '[monitor]':      'log-prefix-monitor',
}

function LogMsg({ msg }: { msg: string }) {
  const match = msg.match(/^(\[\S+\])\s(.*)$/)
  if (!match) return <span>{msg}</span>
  const [, prefix, rest] = match
  return (
    <>
      <span className={`dev-log-prefix ${PREFIX_CLASS[prefix] ?? ''}`}>{prefix}</span>
      {' '}
      <span>{rest}</span>
    </>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dev() {
  const { storeId, isReady } = useAuth()

  const [prepMin, setPrepMin] = useState(20)

  const [ownBtn, setOwnBtn] = useState<BtnStatus>(IDLE)
  const [platformBtn, setPlatformBtn] = useState<BtnStatus>(IDLE)
  const [pickupBtn, setPickupBtn] = useState<BtnStatus>(IDLE)
  const [ifoodBtn, setIfoodBtn] = useState<BtnStatus>(IDLE)
  const [clearBtn, setClearBtn] = useState<BtnStatus>(IDLE)
  const [clearSuggBtn, setClearSuggBtn] = useState<BtnStatus>(IDLE)
  const [alarmBtn, setAlarmBtn] = useState<BtnStatus>(IDLE)
  const [testCount, setTestCount] = useState<number | null>(null)
  const [suggCount, setSuggCount] = useState<number | null>(null)

  // Monitor
  const [log, setLog] = useState<LogEntry[]>([])
  const [eligible, setEligible] = useState<number | null>(null)
  const [pendingSugg, setPendingSugg] = useState<number | null>(null)
  const [engineRunning, setEngineRunning] = useState(false)
  const SOLO_WAIT = Number(import.meta.env.VITE_SOLO_WAIT_MIN ?? 10)

  function addLog(level: LogLevel, msg: string) {
    setLog(prev => [{ id: newId(), ts: new Date(), level, msg }, ...prev].slice(0, MAX_LOG))
  }

  async function refreshStats(sid?: string) {
    const id = sid ?? storeId
    if (!id) return
    const [eligRes, suggRes] = await Promise.all([
      supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', id).eq('route_eligibility', 'eligible').eq('status', 'awaiting_route'),
      supabase.from('dispatch_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', id).eq('status', 'pending_review'),
    ])
    setEligible(eligRes.count ?? 0)
    setPendingSugg(suggRes.count ?? 0)
  }

  useEffect(() => {
    if (!isReady || !storeId) return
    refreshCount(storeId)
    refreshSuggCount(storeId)
    refreshStats(storeId)
  }, [storeId, isReady]) // eslint-disable-line

  // ── Monitor: Supabase Realtime subscriptions ─────────────────────────────────

  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`dev-monitor-${storeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        (payload) => {
          const o = payload.new as Order
          const code = o.platform_order_code ?? o.id.slice(0, 8)
          addLog('info', `[classifier] ${code} recebido → ${o.status} | ${o.route_eligibility ?? '?'}`)
          refreshStats(storeId)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        (payload) => {
          const o = payload.new as Order
          const prev = payload.old as Partial<Order>
          const code = o.platform_order_code ?? o.id.slice(0, 8)

          if (prev.latitude == null && o.latitude != null) {
            addLog('info', `[geocoder] ${code} geocodificado: ${o.latitude.toFixed(4)}, ${o.longitude?.toFixed(4)}`)
          }

          if (prev.status !== o.status || prev.route_eligibility !== o.route_eligibility) {
            let level: LogLevel = 'info'
            if (o.status === 'awaiting_route') level = 'ok'
            if (o.status === 'dispatch_timeout') level = 'error'
            if (o.route_eligibility === 'blocked') level = 'warn'

            const blockInfo = o.route_block_reason ? ` ✗ ${o.route_block_reason}` : ''
            addLog(
              level,
              `[classifier] ${code}: ${prev.status ?? '?'} → ${o.status} | ${o.route_eligibility ?? '?'}${blockInfo}`,
            )
            refreshStats(storeId)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dispatch_suggestions', filter: `store_id=eq.${storeId}` },
        (payload) => {
          const s = payload.new as { suggested_sequence?: string[]; predicted_eta?: number | null }
          const n = Array.isArray(s.suggested_sequence) ? s.suggested_sequence.length : '?'
          const eta = s.predicted_eta != null ? `${s.predicted_eta}min` : 'sem ETA'
          addLog('ok', `[route-engine] Sugestão criada: ${n} pedido(s), ${eta}`)
          refreshStats(storeId)
          refreshSuggCount(storeId)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dispatch_suggestions', filter: `store_id=eq.${storeId}` },
        (payload) => {
          const s = payload.new as { id: string; status: string }
          const prev = payload.old as { status?: string }
          if (s.status && prev.status !== s.status) {
            const level: LogLevel = ['accepted', 'dispatched'].includes(s.status)
              ? 'ok'
              : s.status === 'rejected'
              ? 'warn'
              : 'info'
            addLog(level, `[route-engine] Sugestão ${s.id.slice(0, 8)}: ${prev.status ?? '?'} → ${s.status}`)
            refreshStats(storeId)
            refreshSuggCount(storeId)
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED')    addLog('info', '[monitor] Realtime conectado')
        if (status === 'CHANNEL_ERROR') addLog('error', '[monitor] Erro na conexão Realtime')
        if (status === 'TIMED_OUT')     addLog('warn', '[monitor] Realtime timeout — reconectando...')
      })

    return () => { supabase.removeChannel(channel) }
  }, [storeId])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function refreshCount(sid?: string) {
    const id = sid ?? storeId
    if (!id) return
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', id)
      .ilike('platform_order_id', 'test-%')
    setTestCount(count ?? 0)
  }

  async function refreshSuggCount(sid?: string) {
    const id = sid ?? storeId
    if (!id) return
    const { count } = await supabase
      .from('dispatch_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', id)
      .eq('status', 'pending_review')
    setSuggCount(count ?? 0)
  }

  async function insertOrder(type: 'own' | 'platform' | 'pickup', set: (s: BtnStatus) => void) {
    if (!storeId) {
      set({ state: 'error', msg: 'store_id não resolvido' })
      return
    }
    set({ state: 'loading', msg: '' })
    try {
      const payload = mockOrder(storeId, type, prepMin)
      const { error } = await supabase.from('orders').insert(payload)
      if (error) {
        set({ state: 'error', msg: error.message })
      } else {
        const pLabel = platformLabel(payload.platform)
        const label =
          type === 'own'
            ? `${payload.platform_order_code} - ${pLabel} - entrega própria -> classificador`
            : type === 'platform'
            ? `${payload.platform_order_code} - ${pLabel} - entrega plataforma -> monitoramento`
            : `${payload.platform_order_code} - ${pLabel} - retirada`
        set({ state: 'ok', msg: label })
        refreshCount()
      }
    } catch (e) {
      set({ state: 'error', msg: e instanceof Error ? e.message : String(e) })
    }
    setTimeout(() => set(IDLE), 4000)
  }

  function logEngineResult(result: RouteEngineResult) {
    const d = result.detail ? ` — ${result.detail}` : ''
    const outcomes: Record<RouteEngineResult['outcome'], [LogLevel, string]> = {
      suggestion_created:  ['ok',   `[route-engine] Sugestão criada${d}`],
      concurrent_skip:     ['warn', '[route-engine] Engine já em execução — chamada ignorada'],
      no_store_coords:     ['warn', '[route-engine] Loja sem coordenadas — configure lat/lng em Configurações'],
      no_eligible_orders:  ['info', '[route-engine] Nenhum pedido elegível no momento'],
      all_timed_out:       ['warn', '[route-engine] Todos os pedidos atingiram o limite de recusas'],
      no_coords_on_orders: ['warn', `[route-engine] Pedidos sem coordenadas (geocodificação pendente)${d}`],
      solo_waiting:        ['info', `[route-engine] 1 pedido solo aguardando${d}`],
    }
    const [level, msg] = outcomes[result.outcome] ?? ['info', `[route-engine] ${result.outcome}${d}`]
    addLog(level, msg)
  }

  async function handleForceEngine() {
    if (!storeId) return
    setEngineRunning(true)
    addLog('info', '[route-engine] Execução manual iniciada...')
    try {
      const result = await runRouteEngine(storeId)
      logEngineResult(result)
    } catch (e) {
      addLog('error', `[route-engine] Erro: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEngineRunning(false)
      refreshStats()
      refreshSuggCount()
    }
  }

  async function handleTestIfood() {
    if (!storeId) {
      setIfoodBtn({ state: 'error', msg: 'store_id não resolvido' })
      return
    }
    setIfoodBtn({ state: 'loading', msg: '' })
    try {
      const result = await syncIfood(storeId)
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
    if (!storeId) return
    setClearBtn({ state: 'loading', msg: '' })
    const { error, count } = await supabase
      .from('orders')
      .delete({ count: 'exact' })
      .eq('store_id', storeId)
      .ilike('platform_order_id', 'test-%')

    if (error) {
      setClearBtn({ state: 'error', msg: error.message })
    } else {
      setClearBtn({ state: 'ok', msg: `${count ?? 0} pedido(s) removido(s)` })
      setTestCount(0)
      refreshSuggCount()
    }
    setTimeout(() => setClearBtn(IDLE), 3000)
  }

  async function handleClearSuggestions() {
    if (!storeId) return
    setClearSuggBtn({ state: 'loading', msg: '' })

    // Fetch pending suggestions to know which orders to re-queue
    const { data: suggs, error: fetchErr } = await supabase
      .from('dispatch_suggestions')
      .select('id, suggested_sequence')
      .eq('store_id', storeId)
      .eq('status', 'pending_review')

    if (fetchErr) {
      setClearSuggBtn({ state: 'error', msg: fetchErr.message })
      setTimeout(() => setClearSuggBtn(IDLE), 3000)
      return
    }

    const allOrderIds = (suggs ?? []).flatMap(s => s.suggested_sequence as string[])

    // Reset in_suggestion orders back to awaiting_route
    if (allOrderIds.length > 0) {
      await supabase
        .from('orders')
        .update({ status: 'awaiting_route' })
        .in('id', allOrderIds)
        .eq('status', 'in_suggestion')
    }

    // Delete suggestions
    const { error: delErr, count } = await supabase
      .from('dispatch_suggestions')
      .delete({ count: 'exact' })
      .eq('store_id', storeId)
      .eq('status', 'pending_review')

    if (delErr) {
      setClearSuggBtn({ state: 'error', msg: delErr.message })
    } else {
      setClearSuggBtn({ state: 'ok', msg: `${count ?? 0} sugestão(ões) removida(s)` })
      setSuggCount(0)
    }
    setTimeout(() => setClearSuggBtn(IDLE), 3000)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="dev-panel">
      <div className="dev-header">
        <h1>Dev / Testes</h1>
        <span className="dev-badge">AMBIENTE DE DESENVOLVIMENTO</span>
      </div>

      <section className="dev-section">
        <div className="dev-section-title">Simular pedido (multiplataforma)</div>
        <div className="dev-section-desc">
          Insere um pedido fake diretamente no banco com dados aleatórios.
          <br />
          <span style={{ color: '#555' }}>
            platform_order_id começa com <code>test-</code> para fácil remoção.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: '#888' }}>Tempo de preparo:</label>
          {[10, 15, 20, 25].map(min => (
            <button
              key={min}
              onClick={() => setPrepMin(min)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 5,
                border: '1px solid',
                cursor: 'pointer',
                background: prepMin === min ? '#facc1522' : 'transparent',
                borderColor: prepMin === min ? '#facc15' : '#2a2a2a',
                color: prepMin === min ? '#facc15' : '#666',
                transition: 'all 0.15s',
              }}
            >
              {min} min
            </button>
          ))}
        </div>

        <div className="dev-btn-row">
          <DevButton
            label="Entrega própria"
            desc="-> classificador → fila de despacho"
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

      {/* ── Monitor ──────────────────────────────────────────────────────────── */}

      <section className="dev-section dev-monitor-section">
        <div className="dev-section-title">
          Monitor em tempo real
          <span className="dev-live-dot" title="Realtime conectado" />
        </div>
        <div className="dev-section-desc">
          Eventos de classificação e roteamento ao vivo. Atualize a página para reconectar se o dot parar de pulsar.
        </div>

        <div className="dev-monitor-stats">
          <div className="dev-stat">
            <span className="dev-stat-value">{eligible ?? '—'}</span>
            <span className="dev-stat-label">aguardando rota</span>
          </div>
          <div className="dev-stat">
            <span className="dev-stat-value">{pendingSugg ?? '—'}</span>
            <span className="dev-stat-label">sugestões pendentes</span>
          </div>
          <div className="dev-stat">
            <span className="dev-stat-value">{SOLO_WAIT}min</span>
            <span className="dev-stat-label">espera solo</span>
          </div>
        </div>

        <div className="dev-monitor-controls">
          <button
            className={`dev-monitor-btn${engineRunning ? ' dev-monitor-btn-loading' : ''}`}
            onClick={handleForceEngine}
            disabled={engineRunning || !storeId}
          >
            {engineRunning ? 'Executando...' : 'Forçar route engine'}
          </button>
          <button
            className="dev-monitor-btn dev-monitor-btn-secondary"
            onClick={() => { refreshStats(); refreshCount(); refreshSuggCount() }}
          >
            Atualizar stats
          </button>
          <button
            className="dev-monitor-btn dev-monitor-btn-secondary"
            onClick={() => setLog([])}
            disabled={log.length === 0}
          >
            Limpar log
          </button>
        </div>

        <div className="dev-log">
          {log.length === 0 ? (
            <div className="dev-log-empty">Aguardando eventos...</div>
          ) : (
            log.map(entry => (
              <div key={entry.id} className={`dev-log-entry dev-log-${entry.level}`}>
                <span className="dev-log-time">
                  {entry.ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="dev-log-msg">
                  <LogMsg msg={entry.msg} />
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="dev-section">
        <div className="dev-section-title">
          Limpar dados de teste
          {testCount !== null && <span className="dev-count">{testCount} pedido(s)</span>}
          {suggCount !== null && suggCount > 0 && (
            <span className="dev-count" style={{ marginLeft: 4 }}>{suggCount} sugestão(ões)</span>
          )}
        </div>
        <div className="dev-section-desc">
          Remove pedidos de teste e/ou esvazia a fila de sugestões pendentes.
          Pedidos em sugestão voltam para <code>awaiting_route</code>.
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
          <DevButton
            label="Limpar fila de sugestões"
            desc={suggCount ? `${suggCount} sugestão(ões) pendente(s)` : 'nenhuma sugestão pendente'}
            color="#f97316"
            status={clearSuggBtn}
            onClick={handleClearSuggestions}
            disabled={suggCount === 0}
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
