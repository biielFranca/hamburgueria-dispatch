import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { broadcastAuth, subscribeAuth } from '../../lib/authChannel'
import type { Session } from '@supabase/supabase-js'
import type { UserRole, UserPermissions } from '../../types'

const SESSION_DURATION = 8 * 60 * 60 * 1000

export interface AuthState {
  session:        Session | null
  userRole:       UserRole | null
  permissions:    UserPermissions
  storeId:        string | null
  loading:        boolean
  isReady:        boolean
  sessionExpired: boolean
  signOut:        (expired?: boolean) => Promise<void>
}

const DEFAULT_PERMISSIONS: UserPermissions = { operational: true, orders: true, drivers: true }

const AuthContext = createContext<AuthState>({
  session: null, userRole: null, permissions: DEFAULT_PERMISSIONS,
  storeId: null, loading: true, isReady: false,
  sessionExpired: false, signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const [session, setSession]         = useState<Session | null>(null)
  const [loading, setLoading]         = useState(true)
  const [sessionExpired, setExpired]  = useState(false)
  const [userRole, setUserRole]       = useState<UserRole | null>(null)
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS)
  const [storeId, setStoreId]         = useState<string | null>(null)

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

  // Single source of truth for role + permissions + store_id.
  // Callers must wait for `isReady` before reading storeId; otherwise the
  // brief boot window can return null and trigger spurious "no store" paths.
  async function fetchUserContext(authId: string) {
    const { data, error } = await supabase
      .from('users').select('role, permissions, store_id').eq('auth_id', authId).single()
    if (error) {
      console.warn('[AuthBootstrap] fetchUserContext failed:', error.message)
      // Fail closed: keep role/storeId null so AccessControl gates the UI.
      setUserRole(null)
      setStoreId(null)
      setPermissions(DEFAULT_PERMISSIONS)
      return
    }
    if (data) {
      setUserRole(data.role as UserRole)
      setPermissions({ ...DEFAULT_PERMISSIONS, ...(data.permissions ?? {}) })
      setStoreId((data.store_id as string | null) ?? null)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(session)
      if (session?.user) {
        await fetchUserContext(session.user.id)
      }
      if (!cancelled) setLoading(false)
    }

    bootstrap()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (!session && event === 'TOKEN_REFRESHED')) {
        setSession(null)
        setUserRole(null)
        setPermissions(DEFAULT_PERMISSIONS)
        setStoreId(null)
        return
      }
      setSession(session)
      if (session?.user) fetchUserContext(session.user.id)
      else { setUserRole(null); setStoreId(null) }
    })

    checkExpiry()
    const expiryInterval = setInterval(checkExpiry, 60_000)

    const unsub = subscribeAuth(e => { if (e.type === 'signed_out') signOut(false, false) })

    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearInterval(expiryInterval)
      unsub()
    }
  }, []) // eslint-disable-line

  // Ready when we know who the user is (or that there's no session).
  // For a logged-out user, isReady is true with session=null.
  // For a logged-in user, isReady waits for storeId+role to be loaded.
  const isReady = !loading && (session === null || (userRole !== null && storeId !== null))

  return (
    <AuthContext.Provider value={{
      session, userRole, permissions, storeId,
      loading, isReady, sessionExpired, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
