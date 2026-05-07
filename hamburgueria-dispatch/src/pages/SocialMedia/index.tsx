import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/auth/AuthBootstrap'
import './SocialMedia.css'

const PLATFORMS = [
  {
    key:         'instagram',
    label:       'Instagram',
    color:       '#E1306C',
    placeholder: 'https://instagram.com/sua_loja',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
        <circle cx="12" cy="12" r="4"/>
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    key:         'whatsapp',
    label:       'WhatsApp Business',
    color:       '#25D366',
    placeholder: 'https://wa.me/5511999999999',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
      </svg>
    ),
  },
  {
    key:         'facebook',
    label:       'Facebook',
    color:       '#1877F2',
    placeholder: 'https://facebook.com/sua_loja',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
      </svg>
    ),
  },
  {
    key:         'tiktok',
    label:       'TikTok',
    color:       '#ff0050',
    placeholder: 'https://tiktok.com/@sua_loja',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12a4 4 0 104 4V4a5 5 0 005 5"/>
      </svg>
    ),
  },
  {
    key:         'youtube',
    label:       'YouTube',
    color:       '#FF0000',
    placeholder: 'https://youtube.com/@sua_loja',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.95C5.12 20 12 20 12 20s6.88 0 8.59-.47a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58z"/>
        <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/>
      </svg>
    ),
  },
  {
    key:         'ifood_page',
    label:       'iFood (vitrine)',
    color:       '#EA1D2C',
    placeholder: 'https://www.ifood.com.br/delivery/...',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h18v4H3z"/>
        <path d="M3 7l2 14h14l2-14"/>
        <path d="M9 11a3 3 0 006 0"/>
      </svg>
    ),
  },
  {
    key:         'google_maps',
    label:       'Google Maps',
    color:       '#4285F4',
    placeholder: 'https://maps.google.com/?cid=...',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="10" r="3"/>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      </svg>
    ),
  },
] as const

type PlatformKey = typeof PLATFORMS[number]['key']

interface SocialLink {
  id: string
  store_id: string
  platform: string
  url: string
}

export default function SocialMedia() {
  const [links, setLinks]       = useState<Partial<Record<PlatformKey, SocialLink>>>({})
  const [drafts, setDrafts]     = useState<Partial<Record<PlatformKey, string>>>({})
  const [saving, setSaving]     = useState<Partial<Record<PlatformKey, boolean>>>({})
  const [errors, setErrors]     = useState<Partial<Record<PlatformKey, string>>>({})
  const [success, setSuccess]   = useState<Partial<Record<PlatformKey, boolean>>>({})
  const [loading, setLoading]   = useState(true)
  const [dbError, setDbError]   = useState('')
  const { storeId, isReady } = useAuth()

  useEffect(() => {
    if (!isReady) return
    if (!storeId) { setLoading(false); return }
    fetchLinks()
  }, [storeId, isReady]) // eslint-disable-line

  async function fetchLinks() {
    if (!storeId) return
    const { data, error } = await supabase
      .from('store_social_links').select('*').eq('store_id', storeId)
    if (error) {
      setDbError('Tabela store_social_links não encontrada. Rode a migration necessária.')
      setLoading(false)
      return
    }
    const map: Partial<Record<PlatformKey, SocialLink>> = {}
    const draftMap: Partial<Record<PlatformKey, string>> = {}
    for (const row of (data ?? []) as SocialLink[]) {
      const key = row.platform as PlatformKey
      map[key]   = row
      draftMap[key] = row.url
    }
    setLinks(map)
    setDrafts(draftMap)
    setLoading(false)
  }

  async function handleSave(platformKey: PlatformKey) {
    const sid = storeId
    if (!sid) return

    const url = (drafts[platformKey] ?? '').trim()
    setSaving(s => ({ ...s, [platformKey]: true }))
    setErrors(e => ({ ...e, [platformKey]: '' }))
    setSuccess(s => ({ ...s, [platformKey]: false }))

    try {
      const existing = links[platformKey]
      if (!url) {
        // delete if exists
        if (existing) {
          const { error } = await supabase
            .from('store_social_links').delete().eq('id', existing.id)
          if (error) throw new Error(error.message)
        }
      } else {
        const payload = { store_id: sid, platform: platformKey, url }
        if (existing) {
          const { error } = await supabase
            .from('store_social_links').update({ url }).eq('id', existing.id)
          if (error) throw new Error(error.message)
        } else {
          const { error } = await supabase
            .from('store_social_links').insert(payload)
          if (error) throw new Error(error.message)
        }
      }

      await fetchLinks()
      setSuccess(s => ({ ...s, [platformKey]: true }))
      setTimeout(() => setSuccess(s => ({ ...s, [platformKey]: false })), 2000)
    } catch (e) {
      setErrors(err => ({ ...err, [platformKey]: e instanceof Error ? e.message : String(e) }))
    }

    setSaving(s => ({ ...s, [platformKey]: false }))
  }

  function openLink(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <div className="social-panel"><div className="social-loading">Carregando...</div></div>

  return (
    <div className="social-panel">
      <div className="social-header">
        <h1>Mídias Sociais</h1>
        <p className="social-subtitle">Gerencie os links de presença digital da sua loja.</p>
      </div>

      {dbError ? (
        <div className="social-db-error">{dbError}</div>
      ) : (
        <div className="social-grid">
          {PLATFORMS.map(platform => {
            const key     = platform.key
            const saved   = links[key]
            const draft   = drafts[key] ?? ''
            const isSaving = saving[key] ?? false
            const error   = errors[key] ?? ''
            const ok      = success[key] ?? false
            const dirty   = draft !== (saved?.url ?? '')

            return (
              <div key={key} className={`social-card ${saved ? 'social-card-linked' : ''}`}>
                <div className="social-card-header">
                  <span className="social-icon" style={{ color: platform.color }}>
                    {platform.icon}
                  </span>
                  <div className="social-card-info">
                    <span className="social-platform-name">{platform.label}</span>
                    {saved && (
                      <span className="social-linked-badge">Configurado</span>
                    )}
                  </div>
                  {saved?.url && (
                    <button
                      className="btn-social-open"
                      onClick={() => openLink(saved.url)}
                      title="Abrir link"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </button>
                  )}
                </div>

                <div className="social-url-row">
                  <input
                    className="social-input"
                    value={draft}
                    onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                    placeholder={platform.placeholder}
                  />
                  <button
                    className={`btn-social-save ${ok ? 'success' : ''}`}
                    onClick={() => handleSave(key)}
                    disabled={isSaving || !dirty}
                  >
                    {isSaving ? '...' : ok ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : 'Salvar'}
                  </button>
                </div>

                {error && <p className="social-error">{error}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
