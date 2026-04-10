import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Sidebar from './components/layout/Sidebar'
import Orders from './pages/Orders'
import Operational from './pages/Operational'
import Drivers from './pages/Drivers'
import UsersPage from './pages/Users'
import Integrations from './pages/Integrations'
import Dev from './pages/Dev'
import Settings from './pages/Settings'
import AlertSystem from './components/AlertSystem'
import IfoodPoller from './components/IfoodPoller'
import ClassifierService from './components/ClassifierService'
import RouteEngineService from './components/RouteEngineService'
import type { Session } from '@supabase/supabase-js'
import type { UserRole } from './types'

export type Page = 'operational' | 'orders' | 'drivers' | 'users' | 'integrations' | 'dev' | 'settings'

const SESSION_DURATION = 8 * 60 * 60 * 1000  // 8 hours in ms

export default function App() {
  const [session, setSession]       = useState<Session | null>(null)
  const [loading, setLoading]       = useState(true)
  const [activePage, setActivePage] = useState<Page>('operational')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [userRole, setUserRole]     = useState<UserRole | null>(null)

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
      .from('users').select('role').eq('auth_id', authId).single()
    if (data) setUserRole(data.role as UserRole)
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

  function handleNavigate(page: Page) {
    if (page === 'users'         && userRole !== 'owner' && userRole !== 'admin') return
    if (page === 'integrations'  && userRole !== 'owner' && userRole !== 'admin') return
    if (page === 'settings'      && userRole !== 'owner') return
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
        isOwner={userRole === 'owner' || userRole === 'admin'}
        userRole={userRole}
      />
      <main style={{
        marginLeft: '60px',
        flex: 1,
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#0f0f0f'
      }}>
        {activePage === 'operational' && <Operational />}
        {activePage === 'orders'      && <Orders />}
        {activePage === 'drivers'     && <Drivers />}
        {activePage === 'users'         && (userRole === 'owner' || userRole === 'admin') && <UsersPage />}
        {activePage === 'integrations'  && (userRole === 'owner' || userRole === 'admin') && <Integrations />}
        {activePage === 'dev'           && <Dev />}
        {activePage === 'settings'      && userRole === 'owner' && <Settings />}
        <AlertSystem />
        <IfoodPoller />
        <ClassifierService />
        <RouteEngineService />
      </main>
    </div>
  )
}
