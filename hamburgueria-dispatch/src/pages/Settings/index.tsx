import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabase'
import type { Store } from '../../types'
import './Settings.css'

// Fix default leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Map click handler ─────────────────────────────────────────────────────────

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// ── Settings page ─────────────────────────────────────────────────────────────

export default function Settings() {
  const [store, setStore]       = useState<Store | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const [name, setName]       = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone]     = useState('')
  const [lat, setLat]         = useState('')
  const [lng, setLng]         = useState('')

  const storeIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return
      const { data: userData } = await supabase
        .from('users').select('store_id').eq('auth_id', authData.user.id).single()
      if (!userData) { setLoading(false); return }
      storeIdRef.current = userData.store_id

      const { data: storeData } = await supabase
        .from('stores').select('*').eq('id', userData.store_id).single()
      if (storeData) {
        const s = storeData as Store
        setStore(s)
        setName(s.name ?? '')
        setAddress(s.address ?? '')
        setPhone(s.phone ?? '')
        setLat(s.latitude != null ? String(s.latitude) : '')
        setLng(s.longitude != null ? String(s.longitude) : '')
      }
      setLoading(false)
    }
    load()
  }, [])

  function handleMapClick(latitude: number, longitude: number) {
    setLat(latitude.toFixed(7))
    setLng(longitude.toFixed(7))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!storeIdRef.current) return
    setSaving(true)
    setFeedback(null)

    const parsedLat = lat !== '' ? parseFloat(lat) : null
    const parsedLng = lng !== '' ? parseFloat(lng) : null

    const { error } = await supabase
      .from('stores')
      .update({
        name,
        address,
        phone: phone || null,
        latitude:  parsedLat,
        longitude: parsedLng,
      })
      .eq('id', storeIdRef.current)

    setSaving(false)
    if (error) {
      setFeedback({ type: 'error', msg: `Erro ao salvar: ${error.message}` })
    } else {
      setStore(prev => prev ? { ...prev, name, address, phone: phone || undefined, latitude: parsedLat ?? undefined, longitude: parsedLng ?? undefined } : prev)
      setFeedback({ type: 'success', msg: 'Configurações salvas com sucesso!' })
      setTimeout(() => setFeedback(null), 4000)
    }
  }

  const markerPos: [number, number] | null =
    lat !== '' && lng !== '' && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))
      ? [parseFloat(lat), parseFloat(lng)]
      : null

  const mapCenter: [number, number] = markerPos ?? [-23.55, -46.63]

  if (loading) {
    return <div className="settings-loading">Carregando configurações...</div>
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>Configurações da Loja</h1>
        <p className="settings-subtitle">
          Gerencie as informações da sua loja. Clique no mapa para definir a localização.
        </p>
      </div>

      <div className="settings-body">
        {/* Form */}
        <form className="settings-form" onSubmit={handleSave}>
          <div className="settings-field">
            <label htmlFor="store-name">Nome da loja</label>
            <input
              id="store-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nome da loja"
              required
            />
          </div>

          <div className="settings-field">
            <label htmlFor="store-address">Endereço</label>
            <input
              id="store-address"
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Rua, número, bairro"
            />
          </div>

          <div className="settings-field">
            <label htmlFor="store-phone">Telefone</label>
            <input
              id="store-phone"
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>

          <div className="settings-coords">
            <div className="settings-field">
              <label htmlFor="store-lat">Latitude</label>
              <input
                id="store-lat"
                type="text"
                value={lat}
                onChange={e => setLat(e.target.value)}
                placeholder="-23.5505"
              />
            </div>
            <div className="settings-field">
              <label htmlFor="store-lng">Longitude</label>
              <input
                id="store-lng"
                type="text"
                value={lng}
                onChange={e => setLng(e.target.value)}
                placeholder="-46.6333"
              />
            </div>
          </div>

          <p className="settings-map-hint">
            Clique no mapa para posicionar o pin e preencher latitude/longitude automaticamente.
          </p>

          {feedback && (
            <div className={`settings-feedback ${feedback.type}`}>
              {feedback.msg}
            </div>
          )}

          <button type="submit" className="settings-save-btn" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </form>

        {/* Map */}
        <div className="settings-map-wrap">
          <MapContainer
            center={mapCenter}
            zoom={markerPos ? 15 : 12}
            className="settings-map"
            key={`${mapCenter[0]}-${mapCenter[1]}`}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <MapClickHandler onMapClick={handleMapClick} />
            {markerPos && <Marker position={markerPos} />}
          </MapContainer>
        </div>
      </div>
    </div>
  )
}
