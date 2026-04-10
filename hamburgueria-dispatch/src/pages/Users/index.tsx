import { useEffect, useRef, useState } from 'react'
import { supabase, supabaseAdmin } from '../../lib/supabase'
import type { Driver, User } from '../../types'
import './Users.css'

// ── Types ─────────────────────────────────────────────────────────────────────

type EntryKind = 'operator' | 'driver'
type TypeFilter = 'all' | 'operators' | 'drivers'

interface OperatorEntry { kind: 'operator'; data: User }
interface DriverEntry   { kind: 'driver';   data: Driver }
type Entry = OperatorEntry | DriverEntry

// ── Helpers ───────────────────────────────────────────────────────────────────

function entryId(e: Entry)        { return e.data.id }
function entryName(e: Entry)      { return e.data.name }
function entryCreatedAt(e: Entry) { return e.data.created_at }
function entryActive(e: Entry)    { return e.data.active }

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ kind }: { kind: EntryKind }) {
  return (
    <span className={`user-type-badge ${kind}`}>
      {kind === 'operator' ? 'Operador' : 'Motoboy'}
    </span>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

// ── New user modal ────────────────────────────────────────────────────────────

interface NewModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  storeId: string
}

function NewModal({ open, onClose, onSaved, storeId }: NewModalProps) {
  const [visible,  setVisible]  = useState(false)
  const [kind,     setKind]     = useState<EntryKind>('operator')
  const [name,     setName]     = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setKind('operator')
      setName(''); setUsername(''); setPassword(''); setError('')
      requestAnimationFrame(() => { setVisible(true); setTimeout(() => nameRef.current?.focus(), 60) })
    } else {
      setVisible(false)
    }
  }, [open])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  async function handleSave() {
    setError('')
    const trimName = name.trim()
    if (!trimName) { setError('Nome é obrigatório'); return }

    if (kind === 'operator') {
      const trimUser = username.trim().toLowerCase()
      const trimPass = password.trim()
      if (!trimUser) { setError('Usuário é obrigatório'); return }
      if (!trimPass) { setError('Senha é obrigatória'); return }
      if (!supabaseAdmin) {
        setError('Adicione a service role key do Supabase ao arquivo .env como VITE_SUPABASE_SERVICE_KEY e reinicie o app.')
        return
      }
      setSaving(true)
      const email = `${trimUser}@dispatch.internal`
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: trimPass,
        email_confirm: true,
      })
      if (authError || !authData.user) {
        setSaving(false)
        const msg = authError?.message ?? ''
        if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered')) {
          setError(`Usuário "${trimUser}" já existe. Escolha outro nome de usuário.`)
        } else {
          setError(msg || 'Erro ao criar usuário no auth')
        }
        return
      }
      const { error: dbError } = await supabaseAdmin!.from('users').insert({
        store_id:   storeId,
        auth_id:    authData.user.id,
        name:       trimName,
        username:   trimUser,
        password:   trimPass,
        role:       'operator',
        active:     true,
        created_at: new Date().toISOString(),
      })
      if (dbError) {
        setSaving(false)
        setError(dbError.message)
        return
      }
    } else {
      setSaving(true)
      const { error: dbError } = await supabase.from('drivers').insert({
        store_id:   storeId,
        name:       trimName,
        active:     true,
        created_at: new Date().toISOString(),
      })
      if (dbError) {
        setSaving(false)
        setError(dbError.message)
        return
      }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  if (!open && !visible) return null

  return (
    <div className={`um-overlay ${visible ? 'open' : ''}`} onClick={onClose}>
      <div className="um-modal" onClick={e => e.stopPropagation()}>
        <div className="um-modal-header">
          <span className="um-modal-title">Novo cadastro</span>
          <button className="um-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="um-modal-body">
          {/* Type selector */}
          <div className="um-field">
            <label>Tipo</label>
            <div className="um-kind-toggle">
              <button
                className={`um-kind-btn ${kind === 'operator' ? 'active' : ''}`}
                onClick={() => setKind('operator')}
              >Operador</button>
              <button
                className={`um-kind-btn ${kind === 'driver' ? 'active' : ''}`}
                onClick={() => setKind('driver')}
              >Motoboy</button>
            </div>
          </div>

          <div className="um-field">
            <label>Nome</label>
            <input
              ref={nameRef}
              className="um-input"
              placeholder="Nome completo"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              maxLength={80}
            />
          </div>

          {kind === 'operator' && (
            <>
              <div className="um-field">
                <label>Usuário</label>
                <input
                  className="um-input"
                  placeholder="login do operador"
                  value={username}
                  onChange={e => setUsername(e.target.value.replace(/\s/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  maxLength={40}
                />
              </div>
              <div className="um-field">
                <label>Senha</label>
                <input
                  className="um-input"
                  placeholder="senha inicial"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  maxLength={72}
                />
              </div>
            </>
          )}

          {error && <p className="um-error">{error}</p>}
        </div>

        <div className="um-modal-footer">
          <button className="um-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="um-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit search modal (step 1) ────────────────────────────────────────────────

interface SearchModalProps {
  open: boolean
  entries: Entry[]
  onClose: () => void
  onSelect: (entry: Entry) => void
}

function SearchModal({ open, entries, onClose, onSelect }: SearchModalProps) {
  const [visible, setVisible] = useState(false)
  const [query,   setQuery]   = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      requestAnimationFrame(() => { setVisible(true); setTimeout(() => inputRef.current?.focus(), 60) })
    } else {
      setVisible(false)
    }
  }, [open])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const q = query.toLowerCase()
  const filtered = entries.filter(e => {
    if (entryName(e).toLowerCase().includes(q)) return true
    if (e.kind === 'operator' && e.data.username.toLowerCase().includes(q)) return true
    return false
  })

  if (!open && !visible) return null

  return (
    <div className={`um-overlay ${visible ? 'open' : ''}`} onClick={onClose}>
      <div className="um-modal um-search-modal" onClick={e => e.stopPropagation()}>
        <div className="um-modal-header">
          <span className="um-modal-title">Selecionar cadastro</span>
          <button className="um-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="um-modal-body">
          <div className="um-search-bar">
            <svg className="um-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={inputRef}
              className="um-search-input"
              placeholder="Buscar por nome ou usuário..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className="um-search-results">
            {filtered.length === 0 ? (
              <div className="um-search-empty">Nenhum resultado</div>
            ) : (
              filtered.map(e => (
                <button
                  key={entryId(e)}
                  className="um-search-row"
                  onClick={() => onSelect(e)}
                >
                  <span className="um-search-row-name">{entryName(e)}</span>
                  <TypeBadge kind={e.kind} />
                  {e.kind === 'operator' && (
                    <span className="um-search-row-user">@{e.data.username}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Edit modal (step 2) ───────────────────────────────────────────────────────

interface EditModalProps {
  open: boolean
  entry: Entry | null
  onClose: () => void
  onSaved: () => void
}

function EditModal({ open, entry, onClose, onSaved }: EditModalProps) {
  const [visible,  setVisible]  = useState(false)
  const [name,     setName]     = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [active,   setActive]   = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && entry) {
      setName(entry.data.name)
      setActive(entry.data.active)
      setError('')
      if (entry.kind === 'operator') {
        setUsername(entry.data.username)
        setPassword(entry.data.password ?? '')
      } else {
        setUsername(''); setPassword('')
      }
      requestAnimationFrame(() => { setVisible(true); setTimeout(() => nameRef.current?.focus(), 60) })
    } else {
      setVisible(false)
    }
  }, [open, entry])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  async function handleSave() {
    if (!entry) return
    setError('')
    const trimName = name.trim()
    if (!trimName) { setError('Nome é obrigatório'); return }

    setSaving(true)

    if (entry.kind === 'operator') {
      const trimPass = password.trim()
      const passwordChanged = trimPass && trimPass !== (entry.data.password ?? '')

      if (passwordChanged) {
        if (!supabaseAdmin) {
          setSaving(false)
          setError('Service key não configurada para atualizar senha.')
          return
        }
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
          entry.data.auth_id,
          { password: trimPass }
        )
        if (authError) {
          setSaving(false)
          setError(authError.message)
          return
        }
      }

      const update: Partial<User> = { name: trimName, active }
      if (passwordChanged) update.password = password.trim()

      const { error: dbError } = await (supabaseAdmin ?? supabase)
        .from('users')
        .update(update)
        .eq('id', entry.data.id)
      if (dbError) { setSaving(false); setError(dbError.message); return }

    } else {
      const { error: dbError } = await supabase
        .from('drivers')
        .update({ name: trimName, active })
        .eq('id', entry.data.id)
      if (dbError) { setSaving(false); setError(dbError.message); return }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  if (!open && !visible) return null

  return (
    <div className={`um-overlay ${visible ? 'open' : ''}`} onClick={onClose}>
      <div className="um-modal" onClick={e => e.stopPropagation()}>
        <div className="um-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="um-modal-title">Editar cadastro</span>
            {entry && <TypeBadge kind={entry.kind} />}
          </div>
          <button className="um-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="um-modal-body">
          <div className="um-field">
            <label>Nome</label>
            <input
              ref={nameRef}
              className="um-input"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              maxLength={80}
            />
          </div>

          {entry?.kind === 'operator' && (
            <>
              <div className="um-field">
                <label>Usuário</label>
                <input
                  className="um-input um-input-readonly"
                  value={username}
                  readOnly
                  title="Usuário não pode ser alterado"
                />
              </div>
              <div className="um-field">
                <label>Senha</label>
                <input
                  className="um-input"
                  placeholder="Nova senha (deixe em branco para manter)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  maxLength={72}
                />
              </div>
            </>
          )}

          <div className="um-field um-field-row">
            <label>Status</label>
            <button
              className={`um-active-toggle ${active ? 'on' : 'off'}`}
              onClick={() => setActive(v => !v)}
            >
              <span className="um-toggle-knob" />
              <span className="um-toggle-label">{active ? 'Ativo' : 'Inativo'}</span>
            </button>
          </div>

          {error && <p className="um-error">{error}</p>}
        </div>

        <div className="um-modal-footer">
          <button className="um-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="um-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [operators,   setOperators]   = useState<User[]>([])
  const [drivers,     setDrivers]     = useState<Driver[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState<TypeFilter>('all')
  const [shownPwd,    setShownPwd]    = useState<Set<string>>(new Set())
  const [newOpen,     setNewOpen]     = useState(false)
  const [searchOpen,  setSearchOpen]  = useState(false)
  const [editEntry,   setEditEntry]   = useState<Entry | null>(null)
  const storeIdRef = useRef<string | null>(null)

  // ── Init ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        if (!authData.user) { setLoading(false); return }

        const db = supabaseAdmin ?? supabase
        const { data, error } = await db
          .from('users').select('store_id').eq('auth_id', authData.user.id).single()

        if (error) { console.error('Users init error:', error); setLoading(false); return }

        if (data) {
          storeIdRef.current = data.store_id
          await fetchAll(data.store_id)
        } else {
          setLoading(false)
        }
      } catch (e) {
        console.error('Users init exception:', e)
        setLoading(false)
      }
    }
    init()
  }, [])

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  async function fetchAll(storeId?: string) {
    const sid = storeId ?? storeIdRef.current
    if (!sid) { setLoading(false); return }
    setLoading(true)

    try {
      const db = supabaseAdmin ?? supabase
      const [{ data: ops, error: e1 }, { data: drvs, error: e2 }] = await Promise.all([
        db.from('users').select('*').eq('store_id', sid).order('name'),
        db.from('drivers').select('*').eq('store_id', sid).order('name'),
      ])

      if (e1) console.error('fetchAll users error:', e1)
      if (e2) console.error('fetchAll drivers error:', e2)

      setOperators((ops ?? []) as User[])
      setDrivers((drvs ?? []) as Driver[])
    } finally {
      setLoading(false)
    }
  }

  // ── Build unified list ───────────────────────────────────────────────────────

  const allEntries: Entry[] = [
    ...operators.map(d => ({ kind: 'operator' as const, data: d })),
    ...drivers.map(d   => ({ kind: 'driver'   as const, data: d })),
  ].sort((a, b) => entryName(a).localeCompare(entryName(b)))

  const filtered: Entry[] =
    filter === 'operators' ? allEntries.filter(e => e.kind === 'operator') :
    filter === 'drivers'   ? allEntries.filter(e => e.kind === 'driver')   :
    allEntries

  const counts = {
    all:       allEntries.length,
    operators: operators.length,
    drivers:   drivers.length,
  }

  // ── Toggle active ────────────────────────────────────────────────────────────

  async function handleToggle(entry: Entry) {
    const newActive = !entry.data.active

    // Optimistic update — UI muda imediatamente
    if (entry.kind === 'operator') {
      setOperators(prev => prev.map(o => o.id === entry.data.id ? { ...o, active: newActive } : o))
    } else {
      setDrivers(prev => prev.map(d => d.id === entry.data.id ? { ...d, active: newActive } : d))
    }

    const client = supabaseAdmin ?? supabase
    const table  = entry.kind === 'operator' ? 'users' : 'drivers'
    const { error } = await client.from(table).update({ active: newActive }).eq('id', entry.data.id)
    if (error) {
      console.error('toggle error:', error)
      // Reverte se falhar
      if (entry.kind === 'operator') {
        setOperators(prev => prev.map(o => o.id === entry.data.id ? { ...o, active: entry.data.active } : o))
      } else {
        setDrivers(prev => prev.map(d => d.id === entry.data.id ? { ...d, active: entry.data.active } : d))
      }
    }
  }

  // ── Password reveal ──────────────────────────────────────────────────────────

  function togglePwd(id: string) {
    setShownPwd(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Edit flow ────────────────────────────────────────────────────────────────

  function handleSelectEntry(entry: Entry) {
    setSearchOpen(false)
    setEditEntry(entry)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="um-panel"><div className="um-loading">Carregando...</div></div>
  }

  return (
    <div className="um-panel">
      {/* Header */}
      <div className="um-header">
        <h1>Usuários</h1>
        <div className="um-header-actions">
          <button className="um-btn-secondary" onClick={() => setSearchOpen(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Editar cadastro
          </button>
          <button className="um-btn-primary" onClick={() => setNewOpen(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Novo cadastro
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="um-filter-bar">
        {(['all', 'operators', 'drivers'] as TypeFilter[]).map(f => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {{ all: `Todos (${counts.all})`, operators: `Operadores (${counts.operators})`, drivers: `Motoboys (${counts.drivers})` }[f]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="um-table-wrap">
        {filtered.length === 0 ? (
          <div className="um-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            Nenhum cadastro encontrado
          </div>
        ) : (
          <table className="um-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Usuário</th>
                <th>Senha</th>
                <th>Criado em</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const id      = entryId(entry)
                const active  = entryActive(entry)
                const pwdVisible = shownPwd.has(id)
                const isOp    = entry.kind === 'operator'
                const pwd     = isOp ? (entry.data.password ?? '') : ''

                return (
                  <tr key={id} className={active ? '' : 'row-inactive'}>
                    {/* Nome */}
                    <td className="um-td-name">
                      <span className="um-dot" style={{ background: active ? '#27AE60' : '#2a2a2a' }} />
                      {entryName(entry)}
                    </td>

                    {/* Tipo */}
                    <td><TypeBadge kind={entry.kind} /></td>

                    {/* Usuário */}
                    <td className="um-td-muted">
                      {isOp ? `@${(entry.data as User).username}` : '—'}
                    </td>

                    {/* Senha */}
                    <td>
                      {isOp ? (
                        <div className="um-pwd-cell">
                          <span className="um-pwd-text">
                            {pwd
                              ? (pwdVisible ? pwd : '•'.repeat(Math.min(pwd.length || 8, 12)))
                              : <span style={{ color: '#333' }}>—</span>
                            }
                          </span>
                          {pwd && (
                            <button
                              className="um-pwd-eye"
                              onClick={() => togglePwd(id)}
                              title={pwdVisible ? 'Ocultar' : 'Revelar'}
                            >
                              <EyeIcon open={pwdVisible} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="um-td-muted">—</span>
                      )}
                    </td>

                    {/* Criado em */}
                    <td className="um-td-muted">
                      {new Date(entryCreatedAt(entry)).toLocaleDateString('pt-BR')}
                    </td>

                    {/* Toggle ativo */}
                    <td>
                      <button
                        className={`um-row-toggle ${active ? 'active' : 'inactive'}`}
                        onClick={() => handleToggle(entry)}
                      >
                        {active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      <NewModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSaved={fetchAll}
        storeId={storeIdRef.current ?? ''}
      />
      <SearchModal
        open={searchOpen}
        entries={allEntries}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSelectEntry}
      />
      <EditModal
        open={editEntry !== null}
        entry={editEntry}
        onClose={() => setEditEntry(null)}
        onSaved={fetchAll}
      />
    </div>
  )
}
