import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/auth/AuthBootstrap'
import { syncIfood } from '../../lib/ifood'
import { pollOpenDeliveryEvents } from '../../lib/integrations/openDelivery'
import { fetchAddressByCep } from '../../lib/cep'
import OpenDeliveryPoller from '../../components/OpenDeliveryPoller'
import type { Store } from '../../types'
import './Settings.css'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

type SettingsTab = 'general' | 'connections' | 'plan'

interface Integration {
  id?: string
  store_id: string
  platform: string
  client_id: string
  active: boolean
  last_sync_at: string | null
  last_error: string | null
}

const PLATFORM_DEFS = [
  {
    key: 'ifood',
    label: 'iFood',
    color: '#EA1D2C',
    description: 'Recebe pedidos automaticamente via Merchant API',
    disabled: false,
  },
  {
    key: 'keeta',
    label: 'Keeta',
    color: '#27AE60',
    description: 'Recebe pedidos via Open Delivery. Logistics sempre gerenciada pela Keeta.',
    disabled: false,
  },
  {
    key: '99food',
    label: '99Food',
    color: '#F5A623',
    description: 'Recebe pedidos em tempo real via webhook da 99Food, com suporte a logística própria.',
    disabled: false,
  },
]

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024
const LOGO_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo selecionado.'))
    reader.readAsDataURL(file)
  })
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function IntegrationCard({
  def,
  integration,
  storeId,
  onSaved,
}: {
  def: typeof PLATFORM_DEFS[0]
  integration: Integration | null
  storeId: string
  onSaved: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [clientId, setClientId] = useState(integration?.client_id ?? '')
  const [active, setActive] = useState(integration?.active ?? false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    if (integration) {
      setClientId(integration.client_id)
      setActive(integration.active)
    }
  }, [integration])

  async function handleSave() {
    if (!clientId.trim()) {
      setError('Preencha Client ID')
      return
    }
    setSaving(true)
    setError('')
    const payload: Record<string, unknown> = {
      store_id: storeId,
      platform: def.key,
      client_id: clientId.trim(),
      active,
    }
    const { error: dbError } = integration?.id
      ? await supabase.from('store_integrations').update(payload).eq('id', integration.id)
      : await supabase.from('store_integrations').upsert(payload, { onConflict: 'store_id,platform' })

    setSaving(false)
    if (dbError) {
      setError(dbError.message)
      return
    }
    onSaved()
    setExpanded(false)
  }

  async function handleTest() {
    if (!clientId.trim()) {
      setError('Preencha Client ID antes de testar')
      return
    }

    setTesting(true)
    setError('')
    setTestResult(null)

    try {
      if (def.key === 'ifood') {
        const result = await syncIfood(storeId)
        setTestResult(`✓ Sync ok — ${result.events} evento(s), ${result.inserted} inserido(s)`)
      } else if (def.key === '99food') {
        // No pull API on this path: orders are pushed to food99-webhook
        setTestResult('A 99Food envia os pedidos por webhook. Faça um pedido de teste para conferir.')
      } else {
        await pollOpenDeliveryEvents('keeta', storeId, clientId.trim())
        setTestResult(`✓ Conexão ok — ${def.label} respondeu com sucesso`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }

    setTesting(false)
  }

  const isConfigured = Boolean(integration?.client_id)
  const lastSync = integration?.last_sync_at ? new Date(integration.last_sync_at).toLocaleString('pt-BR') : null

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
          {integration?.last_error && <span className="int-error-dot" title={integration.last_error} />}
          <svg
            className={`int-chevron ${expanded ? 'open' : ''}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <polyline points="6 9 12 15 18 9" />
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
              value="Gerenciado no backend"
              readOnly
              title="Client Secret não é exposto no frontend"
            />
          </div>
          <div className="int-field-row">
            <label>Recebimento automático</label>
            <button className={`int-toggle ${active ? 'on' : 'off'}`} onClick={() => setActive(v => !v)}>
              <span className="int-toggle-knob" />
              <span className="int-toggle-label">{active ? 'Ativado' : 'Desativado'}</span>
            </button>
          </div>
          {error && <p className="int-error">{error}</p>}
          {testResult && <p className="int-success">{testResult}</p>}
          <div className="int-actions">
            <button className="int-btn-test" onClick={handleTest} disabled={testing || saving}>
              {testing ? 'Testando...' : 'Testar conexão'}
            </button>
            <button className="int-btn-save" onClick={handleSave} disabled={saving || testing}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TabGeneral({ storeId }: { storeId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)
  const [geocodeLoading, setGeocodeLoading] = useState(false)

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [cep, setCep] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')

  useEffect(() => {
    async function load() {
      const { data: storeData } = await supabase
        .from('stores')
        .select('id,name,address,phone,logo_url,latitude,longitude,active,created_at')
        .eq('id', storeId)
        .single()
      if (storeData) {
        const s = storeData as Store
        setName(s.name ?? '')
        setAddress(s.address ?? '')
        setPhone(s.phone ?? '')
        setLogoUrl(s.logo_url ?? '')
        setLat(s.latitude != null ? String(s.latitude) : '')
        setLng(s.longitude != null ? String(s.longitude) : '')
      }
      setLoading(false)
    }
    load()
  }, [storeId])

  function handleMapClick(latitude: number, longitude: number) {
    setLat(latitude.toFixed(7))
    setLng(longitude.toFixed(7))
  }

  async function nominatimGeocode(query: string): Promise<{ lat: string; lon: string } | null> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`,
        { headers: { 'Accept': 'application/json' } },
      )
      const data = await res.json()
      if (data?.[0]?.lat && data?.[0]?.lon) return { lat: data[0].lat, lon: data[0].lon }
    } catch { /* ignore */ }
    return null
  }

  async function handleCepChange(raw: string) {
    setCep(raw)
    setCepError(null)
    const digits = raw.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const result = await fetchAddressByCep(digits)
      const fullAddress = `${result.street}, ${result.neighborhood}, ${result.city} - ${result.state}`
      setAddress(fullAddress)
      // Geocode via Nominatim using the CEP
      const geo = await nominatimGeocode(`${digits}, Brasil`)
      if (geo) {
        setLat(parseFloat(geo.lat).toFixed(7))
        setLng(parseFloat(geo.lon).toFixed(7))
      }
    } catch (e) {
      setCepError(e instanceof Error ? e.message : 'CEP inválido')
    }
    setCepLoading(false)
  }

  async function handleLogoChange(file: File | null) {
    if (!file) return

    const hasValidExtension = /\.(png|jpe?g|webp|svg)$/i.test(file.name)
    const isAllowedType = LOGO_ALLOWED_TYPES.includes(file.type) || hasValidExtension

    if (!isAllowedType) {
      setFeedback({ type: 'error', msg: 'Formato invalido. Use PNG, JPG, WEBP ou SVG.' })
      return
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setFeedback({ type: 'error', msg: 'A logo deve ter no maximo 2MB.' })
      return
    }

    setLogoUploading(true)
    setFeedback(null)

    try {
      const dataUrl = await fileToDataUrl(file)
      if (!dataUrl) throw new Error('Arquivo vazio')
      setLogoUrl(dataUrl)
      setFeedback({ type: 'success', msg: 'Logo carregada. Clique em Salvar configuracoes para aplicar.' })
      setTimeout(() => setFeedback(null), 3500)
    } catch {
      setFeedback({ type: 'error', msg: 'Nao foi possivel carregar a imagem da logo.' })
    } finally {
      setLogoUploading(false)
    }
  }

  function handleLogoRemove() {
    setLogoUrl('')
    setFeedback({ type: 'success', msg: 'Logo removida. Clique em Salvar configuracoes para aplicar.' })
    setTimeout(() => setFeedback(null), 3500)
  }

  async function handleGeocode() {
    const query = address.trim() || cep.trim()
    if (!query) return
    setGeocodeLoading(true)
    const geo = await nominatimGeocode(`${query}, Brasil`)
    setGeocodeLoading(false)
    if (geo) {
      setLat(parseFloat(geo.lat).toFixed(7))
      setLng(parseFloat(geo.lon).toFixed(7))
    } else {
      setFeedback({ type: 'error', msg: 'Endereço não encontrado. Tente ajustar o endereço ou posicionar o pin no mapa.' })
      setTimeout(() => setFeedback(null), 5000)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()

    const cleanPhone = phone.replace(/[^\d+]/g, '')
    const parsedLat = lat !== '' ? parseFloat(lat) : null
    const parsedLng = lng !== '' ? parseFloat(lng) : null

    if (cleanPhone && !/^\+?\d{10,14}$/.test(cleanPhone)) {
      setFeedback({ type: 'error', msg: 'Telefone inválido' })
      return
    }
    if (lat && !/^[-+]?\d+(\.\d+)?$/.test(lat)) {
      setFeedback({ type: 'error', msg: 'Latitude inválida' })
      return
    }
    if (lng && !/^[-+]?\d+(\.\d+)?$/.test(lng)) {
      setFeedback({ type: 'error', msg: 'Longitude inválida' })
      return
    }

    setSaving(true)
    setFeedback(null)
    const basePayload = {
      name: name.trim(),
      address: address.trim(),
      phone: cleanPhone || null,
      latitude: parsedLat,
      longitude: parsedLng,
    }

    let logoColumnMissing = false
    let { error } = await supabase
      .from('stores')
      .update({
        ...basePayload,
        logo_url: logoUrl || null,
      })
      .eq('id', storeId)

    if (error && /logo_url/i.test(error.message ?? '')) {
      logoColumnMissing = true
      const fallback = await supabase.from('stores').update(basePayload).eq('id', storeId)
      error = fallback.error
    }
    setSaving(false)

    if (error) {
      setFeedback({ type: 'error', msg: `Erro ao salvar: ${error.message}` })
      return
    }

    if (logoColumnMissing) {
      setFeedback({ type: 'error', msg: 'Dados salvos, mas o banco ainda não possui a coluna logo_url.' })
      return
    }

    setFeedback({ type: 'success', msg: 'Configurações salvas com sucesso!' })
    setTimeout(() => setFeedback(null), 4000)
  }

  const markerPos: [number, number] | null =
    lat !== '' && lng !== '' && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))
      ? [parseFloat(lat), parseFloat(lng)]
      : null

  const mapCenter: [number, number] = markerPos ?? [-23.55, -46.63]

  if (loading) {
    return <div className="settings-tab-loading">Carregando...</div>
  }

  return (
    <div className="settings-body">
      <form className="settings-form" onSubmit={handleSave}>
        <div className="settings-field">
          <label>Logo da loja</label>
          <div className="settings-logo-editor">
            <div className="settings-logo-preview-wrap">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo da loja" className="settings-logo-preview" />
              ) : (
                <span className="settings-logo-placeholder">Sem logo</span>
              )}
            </div>
            <div className="settings-logo-actions">
              <label className={`settings-logo-upload-btn ${logoUploading ? 'is-loading' : ''}`}>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={logoUploading || saving}
                  onChange={async (e) => {
                    const file = e.target.files?.[0] ?? null
                    await handleLogoChange(file)
                    e.currentTarget.value = ''
                  }}
                />
                {logoUploading ? 'Carregando...' : 'Subir imagem'}
              </label>
              {logoUrl && (
                <button
                  type="button"
                  className="settings-logo-remove-btn"
                  onClick={handleLogoRemove}
                  disabled={saving || logoUploading}
                >
                  Remover
                </button>
              )}
              <span className="settings-logo-hint">PNG, JPG, WEBP ou SVG até 2MB.</span>
            </div>
          </div>
        </div>
        <div className="settings-field">
          <label htmlFor="store-name">Nome da loja</label>
          <input id="store-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome da loja" required />
        </div>
        <div className="settings-field">
          <label htmlFor="store-cep">CEP</label>
          <input id="store-cep" type="text" value={cep} onChange={e => handleCepChange(e.target.value)} placeholder="00000-000" maxLength={9} />
          {cepLoading && <span className="settings-cep-hint">Buscando...</span>}
          {cepError   && <span className="settings-cep-error">{cepError}</span>}
        </div>
        <div className="settings-field">
          <label htmlFor="store-address">Endereço</label>
          <input id="store-address" type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, número, bairro (preenchido pelo CEP)" />
        </div>
        <div className="settings-field">
          <label htmlFor="store-phone">Telefone</label>
          <input id="store-phone" type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
        </div>
        <div className="settings-coords">
          <div className="settings-field">
            <label htmlFor="store-lat">Latitude</label>
            <input id="store-lat" type="text" value={lat} onChange={e => setLat(e.target.value)} placeholder="-23.5505" />
          </div>
          <div className="settings-field">
            <label htmlFor="store-lng">Longitude</label>
            <input id="store-lng" type="text" value={lng} onChange={e => setLng(e.target.value)} placeholder="-46.6333" />
          </div>
        </div>
        <button
          type="button"
          className="settings-geocode-btn"
          onClick={handleGeocode}
          disabled={geocodeLoading || (!address.trim() && !cep.trim())}
        >
          {geocodeLoading ? 'Buscando...' : 'Geocodificar pelo endereço'}
        </button>
        <p className="settings-map-hint">O CEP preenche o endereço e geocodifica automaticamente. Você também pode clicar no mapa ou usar o botão acima.</p>
        {feedback && <div className={`settings-feedback ${feedback.type}`}>{feedback.msg}</div>}
        <button type="submit" className="settings-save-btn" disabled={saving || logoUploading}>
          {saving ? 'Salvando...' : logoUploading ? 'Carregando logo...' : 'Salvar configurações'}
        </button>
      </form>

      <div className="settings-map-wrap">
        <MapContainer center={mapCenter} zoom={markerPos ? 15 : 12} className="settings-map" key={`${mapCenter[0]}-${mapCenter[1]}`}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapClickHandler onMapClick={handleMapClick} />
          {markerPos && <Marker position={markerPos} />}
        </MapContainer>
      </div>
    </div>
  )
}

function TabConnections({ storeId }: { storeId: string }) {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchIntegrations()
  }, [storeId])

  async function fetchIntegrations() {
    const { data } = await supabase
      .from('store_integrations')
      .select('id,store_id,platform,client_id,active,last_sync_at,last_error')
      .eq('store_id', storeId)
      .limit(20)
    setIntegrations((data ?? []) as Integration[])
    setLoading(false)
  }

  if (loading) {
    return <div className="settings-tab-loading">Carregando...</div>
  }

  return (
    <div className="settings-connections">
      <p className="settings-connections-desc">
        Configure as plataformas para recebimento automático de pedidos. O status de conexão do iFood é exibido aqui.
      </p>
      <div className="int-content">
        {PLATFORM_DEFS.map(def => {
          const integration = integrations.find(i => i.platform === def.key) ?? null
          return (
            <IntegrationCard
              key={def.key}
              def={def}
              integration={integration}
              storeId={storeId}
              onSaved={fetchIntegrations}
            />
          )
        })}
      </div>
      <OpenDeliveryPoller />
    </div>
  )
}

function TabPlan() {
  const PLAN = {
    name: 'Dispatch Pro',
    expiresAt: '2026-12-31',
    features: [
      'Painel operacional em tempo real',
      'Motor de rotas com agrupamento automático',
      'Integração iFood (Merchant API)',
      'Integração 99Food e Keeta (em breve)',
      'Alertas de atraso com sons configuráveis',
      'Gestão de motoboys',
      'Múltiplos operadores',
    ],
  }

  const expiry = new Date(PLAN.expiresAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="settings-plan">
      <div className="plan-card">
        <div className="plan-card-header">
          <div>
            <div className="plan-name">{PLAN.name}</div>
            <div className="plan-expiry">Válido até {expiry}</div>
          </div>
          <span className="plan-badge">Ativo</span>
        </div>

        <div className="plan-divider" />

        <div className="plan-features-title">Recursos incluídos</div>
        <ul className="plan-features">
          {PLAN.features.map((f, i) => (
            <li key={i} className="plan-feature-item">
              <svg width="14" height="14" fill="none" stroke="#4ade80" strokeWidth="2.5" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const { storeId, isReady } = useAuth()
  const loading = !isReady

  const TABS: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: 'Configurações Gerais' },
    { key: 'connections', label: 'Conexões' },
    { key: 'plan', label: 'Meu Plano' },
  ]

  if (loading) {
    return <div className="settings-loading">Carregando configurações...</div>
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>Configurações da Loja</h1>
      </div>

      <div className="settings-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`settings-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="settings-tab-content">
        {activeTab === 'general' && storeId && <TabGeneral storeId={storeId} />}
        {activeTab === 'connections' && storeId && <TabConnections storeId={storeId} />}
        {activeTab === 'plan' && <TabPlan />}
        {!storeId && <div className="settings-tab-loading">Loja não encontrada.</div>}
      </div>
    </div>
  )
}
