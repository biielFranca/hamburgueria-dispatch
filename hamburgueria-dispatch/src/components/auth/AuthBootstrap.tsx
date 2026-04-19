import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { broadcastAuth, subscribeAuth } from '../../lib/authChannel'
import type { Session } from '@supabase/supabase-js'
import type { UserRole, UserPermissions } from '../../types'

const SESSION_DURATION = 8 * 60 * 60 * 1000

export interface AuthState {
  session:     Session | null
  userRole:    UserRole | null
  permissions: UserPermissions
  loading:     boolean
  sessionExpired: boolean
  signOut:     (expired?: boolean) => Promise<void>
}

const DEFAULT_PERMISSIONS: UserPermissions = { operational: true, orders: true, drivers: true }

const AuthContext = createContext<AuthState>({
  session: null, userRole: null, permissions: DEFAULT_PERMISSIONS,
  loading: true, sessionExpired: false, signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const [session, setSession]             = useState<Session | null>(null)
  const [loading, setLoading]             = useState(true)
  const [sessionExpired, setExpired]      = useState(false)
  const [userRole, setUserRole]           = useState<UserRole | null>(null)
  const [permissions, setPermissions]     = useState<UserPermissions>(DEFAULT_PERMISSIONS)

  async function signOut(expired = false, notify = true) {
    localStorage.removeItem('dispatch_login_at')
    await supabase.auth.signOut()
    if (expired) setExpired(true)
    if (notify)  broadcastAuth({ type: 'signed_out', at: Date.now() })
  }

  function checkExpiry() {
    const loginAt = localStorage.getItem('dispatch_login_at')
    if (loginAt && Date.now() - Number(loginAt) >= SESSION_DURATION) signOut(true)
  }

  async function fetchRole(authId: string) {
    const { data, error } = await supabase
      .from('users').select('role, permissions').eq('auth_id', authId).single()
    if (error) {
      console.warn('[AuthBootstrap] fetchRole failed:', error.message)
      return
    }
    if (data) {
      setUserRole(data.role as UserRole)
      // Merge with defaults so partial/empty objects don't hide tabs
      setPermissions({ ...DEFAULT_PERMISSIONS, ...(data.permissions ?? {}) })
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
      if (session?.user) fetchRole(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (!session && event === 'TOKEN_REFRESHED')) {
        setSession(null); setUserRole(null); setPermissions(DEFAULT_PERMISSIONS); return
      }
      setSession(session)
      if (session?.user) fetchRole(session.user.id)
      else setUserRole(null)
    })

    checkExpiry()
    const expiryInterval = setInterval(checkExpiry, 60_000)

    const unsub = subscribeAuth(e => { if (e.type === 'signed_out') signOut(false, false) })

    return () => { subscription.unsubscribe(); clearInterval(expiryInterval); unsub() }
  }, []) // eslint-disable-line

  return (
    <AuthContext.Provider value={{ session, userRole, permissions, loading, sessionExpired, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
