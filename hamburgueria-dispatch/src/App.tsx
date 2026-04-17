import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Sidebar from './components/layout/Sidebar'
import Orders from './pages/Orders'
import Operational from './pages/Operational'
import Drivers from './pages/Drivers'
import UsersPage from './pages/Users'
import Dev from './pages/Dev'
import Settings from './pages/Settings'
import Cardapio from './pages/Cardapio'
import Estoque from './pages/Estoque'
import SocialMedia from './pages/SocialMedia'
import AlertSystem from './components/AlertSystem'
import ClassifierService from './components/ClassifierService'
import RouteEngineService from './components/RouteEngineService'
import type { Session } from '@supabase/supabase-js'
import type { UserPermissions, UserRole } from './types'

export type Page = 'operational' | 'orders' | 'drivers' | 'users' | 'dev' | 'settings' | 'cardapio' | 'estoque' | 'social'

const DEFAULT_PERMISSIONS: UserPermissions = { operational: true, orders: true, drivers: true }

const SESSION_DURATION = 8 * 60 * 60 * 1000  // 8 hours in ms

export default function App() {
  const [session, setSession]       = useState<Session | null>(null)
  const [loading, setLoading]       = useState(true)
  const [activePage, setActivePage] = useState<Page>('operational')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [userRole, setUserRole]     = useState<UserRole | null>(null)
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS)

  async function signOut(expired = false) {
    localStorage.removeItem('dispatch_login_at')
    await supabase.auth.signOut()
    if (expired) setSessionExpired(true)
  }

  function checkSessionExpiry() {
    const loginAt = localStorage.getItem('dispatch_login_at')
    if (!loginAt) return
    if (Date.now() - Number(loginAt) >= SESSION_DURATION) {
      signOut(true)
    }
  }

  async function fetchUserRole(authId: string) {
    const { data } = await supabase
      .from('users').select('role, permissions').eq('auth_id', authId).single()
    if (data) {
      setUserRole(data.role as UserRole)
      setPermissions(data.permissions ?? DEFAULT_PERMISSIONS)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
      if (session?.user) fetchUserRole(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (!session && event === 'TOKEN_REFRESHED')) {
        setSession(null)
        setUserRole(null)
        setPermissions(DEFAULT_PERMISSIONS)
        return
      }
      setSession(session)
      if (session?.user) fetchUserRole(session.user.id)
      else setUserRole(null)
    })

    checkSessionExpiry()
    const expiryInterval = setInterval(checkSessionExpiry, 60_000)

    return () => {
      subscription.unsubscribe()
      clearInterval(expiryInterval)
    }
  }, []) // eslint-disable-line

  async function handleLogout() {
    await signOut(false)
  }

  const isOwner = userRole === 'owner' || userRole === 'admin'

  function hasAccess(page: Page): boolean {
    if (page === 'users'    && !isOwner) return false
    if (page === 'dev'      && userRole !== 'owner') return false
    if (page === 'settings' && userRole !== 'owner') return false
    if (page === 'cardapio' && !isOwner) return false
    if (page === 'estoque'  && !isOwner) return false
    if (page === 'social'   && !isOwner) return false
    // permission-based pages (non-owner operators)
    if (!isOwner) {
      if (page === 'operational' && !permissions.operational) return false
      if (page === 'orders'      && !permissions.orders)      return false
      if (page === 'drivers'     && !permissions.drivers)     return false
    }
    return true
  }

  function handleNavigate(page: Page) {
    if (!hasAccess(page)) return
    setActivePage(page)
  }

  if (loading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f0f0f',
        color: '#666',
        fontSize: '14px'
      }}>
        Carregando...
      </div>
    )
  }

  if (!session) {
    return <Login sessionExpired={sessionExpired} />
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        isOwner={isOwner}
        userRole={userRole}
        permissions={permissions}
      />
      <main style={{
        marginLeft: '60px',
        flex: 1,
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#0f0f0f'
      }}>
        {activePage === 'operational' && hasAccess('operational') && <Operational />}
        {activePage === 'orders'      && hasAccess('orders')      && <Orders />}
        {activePage === 'drivers'     && hasAccess('drivers')     && <Drivers />}
        {activePage === 'users'       && hasAccess('users')       && <UsersPage />}
        {activePage === 'dev'         && hasAccess('dev')         && <Dev />}
        {activePage === 'settings'    && hasAccess('settings')    && <Settings />}
        {activePage === 'cardapio'    && hasAccess('cardapio')    && <Cardapio />}
        {activePage === 'estoque'     && hasAccess('estoque')     && <Estoque />}
        {activePage === 'social'      && hasAccess('social')      && <SocialMedia />}
        <AlertSystem />
        <ClassifierService />
        <RouteEngineService />
      </main>
    </div>
  )
}
