import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { supabaseAdmin } from '../../lib/supabase'
import { syncIfood, testIfoodCredentials } from '../../lib/ifood'
import './Integrations.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Integration {
  id?: string
  store_id: string
  platform: string
  client_id: string
  client_secret: string
  active: boolean
  last_sync_at: string | null
  last_error: string | null
}

// ── Platform definitions ──────────────────────────────────────────────────────

const PLATFORM_DEFS = [
  {
    key: 'ifood',
    label: 'iFood',
    color: '#EA1D2C',
    description: 'Recebe pedidos automaticamente via Merchant API',
    fields: { clientId: 'Client ID', clientSecret: 'Client Secret' },
    docsUrl: 'https://developer.ifood.com.br',
  },
  {
    key: 'keeta',
    label: 'Keeta',
    color: '#27AE60',
    description: 'Em breve',
    disabled: true,
  },
  {
    key: '99food',
    label: '99Food',
    color: '#F5A623',
    description: 'Em breve',
    disabled: true,
  },
  {
    key: 'cardapio_web',
    label: 'Cardápio Web',
    color: '#8B5CF6',
    description: 'Em breve',
    disabled: true,
  },
]

// ── Integration card ──────────────────────────────────────────────────────────

interface CardProps {
  def: typeof PLATFORM_DEFS[0]
  integration: Integration | null
  storeId: string
  onSaved: () => void
}

function IntegrationCard({ def, integration, storeId, onSaved }: CardProps) {
  const [expanded,    setExpanded]    = useState(false)
  const [clientId,    setClientId]    = useState(integration?.client_id ?? '')
  const [clientSecret,setClientSecret]= useState(integration?.client_secret ?? '')
  const [active,      setActive]      = useState(integration?.active ?? false)
  const [saving,      setSaving]      = useState(false)
  const [testing,     setTesting]     = useState(false)
  const [error,       setError]       = useState('')
  const [testResult,  setTestResult]  = useState<string | null>(null)

  useEffect(() => {
    if (integration) {
      setClientId(integration.client_id)
      setClientSecret(integration.client_secret)
      setActive(integration.active)
    }
  }, [integration])

  async function handleSave() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Preencha Client ID e Client Secret')
      return
    }
    setSaving(true)
    setError('')

    const db = supabaseAdmin ?? supabase
    const payload = {
      store_id:      storeId,
      platform:      def.key,
      client_id:     clientId.trim(),
      client_secret: clientSecret.trim(),
      active,
    }

    const { error: dbError } = integration?.id
      ? await db.from('store_integrations').update(payload).eq('id', integration.id)
      : await db.from('store_integrations').upsert(payload, { onConflict: 'store_id,platform' })

    setSaving(false)
    if (dbError) { setError(dbError.message); return }
    onSaved()
    setExpanded(false)
  }

  async function handleTest() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Preencha Client ID e Client Secret antes de testar')
      return
    }
    setTesting(true)
    setTestResult(null)
    setError('')

    try {
      const result = await testIfoodCredentials(clientId.trim(), clientSecret.trim())
      setTestResult(`✓ Credenciais válidas — ${result.events} evento(s) na fila`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setTesting(false)
  }

  const isConfigured = !!(integration?.client_id)
  const lastSync = integration?.last_sync_at
    ? new Date(integration.last_sync_at).toLocaleString('pt-BR')
    : null

  if (def.disabled) {
    return (
      <div className="int-card int-card-disabled">
        <div className="int-card-header">
          <div className="int-card-left">
            <span className="int-platform-dot" style={{ background: def.color }} />
            <span className="int-platform-name" style={{ color: def.color }}>{def.label}</span>
          </div>
          <span className="int-badge int-badge-soon">Em breve</span>
        </div>
        <p className="int-description">{def.description}</p>
      </div>
    )
  }

  return (
    <div className={`int-card ${isConfigured ? 'int-card-configured' : ''}`}>
      <div className="int-card-header" onClick={() => setExpanded(v => !v)}>
        <div className="int-card-left">
          <span className="int-platform-dot" style={{ background: def.color }} />
          <span className="int-platform-name" style={{ color: def.color }}>{def.label}</span>
          {isConfigured && (
            <span className={`int-badge ${active ? 'int-badge-active' : 'int-badge-inactive'}`}>
              {active ? 'Ativo' : 'Inativo'}
            </span>
          )}
        </div>
        <div className="int-card-right">
          {lastSync && <span className="int-last-sync">sync {lastSync}</span>}
          {integration?.last_error && (
            <span className="int-error-dot" title={integration.last_error} />
          )}
          <svg
            className={`int-chevron ${expanded ? 'open' : ''}`}
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      <p className="int-description">{def.description}</p>

      {expanded && (
        <div className="int-form">
          <div className="int-field">
            <label>Client ID</label>
            <input
              className="int-input"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
            />
          </div>
          <div className="int-field">
            <label>Client Secret</label>
            <input
              className="int-input"
              type="password"
              placeholder="••••••••••••••••"
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
            />
          </div>

          <div className="int-field-row">
            <label>Recebimento automático</label>
            <button
              className={`int-toggle ${active ? 'on' : 'off'}`}
              onClick={() => setActive(v => !v)}
            >
              <span className="int-toggle-knob" />
              <span className="int-toggle-label">{active ? 'Ativado' : 'Desativado'}</span>
            </button>
          </div>

          {error && <p className="int-error">{error}</p>}
          {testResult && <p className="int-success">{testResult}</p>}

          <div className="int-actions">
            <button
              className="int-btn-test"
              onClick={handleTest}
              disabled={testing || saving}
            >
              {testing ? 'Testando...' : 'Testar conexão'}
            </button>
            <button
              className="int-btn-save"
              onClick={handleSave}
              disabled={saving || testing}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading,      setLoading]      = useState(true)
  const storeIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return
      const { data: userData } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (!userData) { setLoading(false); return }
      storeIdRef.current = userData.store_id
      await fetchIntegrations(userData.store_id)
    }
    init()
  }, [])

  async function fetchIntegrations(storeId?: string) {
    const sid = storeId ?? storeIdRef.current
    if (!sid) return
    const db = supabaseAdmin ?? supabase
    const { data } = await db
      .from('store_integrations')
      .select('*')
      .eq('store_id', sid)
    setIntegrations((data ?? []) as Integration[])
    setLoading(false)
  }

  if (loading) {
    return <div className="int-panel"><div className="int-loading">Carregando...</div></div>
  }

  return (
    <div className="int-panel">
      <div className="int-header">
        <h1>Integrações</h1>
        <p className="int-subtitle">Configure as plataformas para recebimento automático de pedidos</p>
      </div>

      <div className="int-content">
        {PLATFORM_DEFS.map(def => {
          const integration = integrations.find(i => i.platform === def.key) ?? null
          return (
            <IntegrationCard
              key={def.key}
              def={def}
              integration={integration}
              storeId={storeIdRef.current ?? ''}
              onSaved={() => fetchIntegrations()}
            />
          )
        })}
      </div>
    </div>
  )
}
