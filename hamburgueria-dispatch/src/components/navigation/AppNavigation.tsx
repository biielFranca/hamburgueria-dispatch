import { lazy, Suspense, useState } from 'react'
import { useAccess } from '../auth/AccessControl'
import { useAuth } from '../auth/AuthBootstrap'
import Sidebar from '../layout/Sidebar'
import Orders from '../../pages/Orders'
import Operational from '../../pages/Operational'
import Drivers from '../../pages/Drivers'
import UsersPage from '../../pages/Users'
import Settings from '../../pages/Settings'
import Cardapio from '../../pages/Cardapio'
import Estoque from '../../pages/Estoque'
import SocialMedia from '../../pages/SocialMedia'
import ErrorBoundary from '../ErrorBoundary'
import type { Page } from '../../App'

// Dev page (fake orders, manual engine runs) exists only in `npm run tauri dev`:
// import.meta.env.DEV is false in production builds, so Vite drops this
// branch and the page never ships inside the executable (roadmap 1.5).
const Dev = import.meta.env.DEV ? lazy(() => import('../../pages/Dev')) : null

export function AppNavigation() {
  const [activePage, setActivePage] = useState<Page>('operational')
  const { isOwner, userRole, hasAccess } = useAccess()
  const { signOut } = useAuth()

  function handleNavigate(page: Page) {
    if (hasAccess(page)) setActivePage(page)
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        onLogout={() => signOut(false)}
        isOwner={isOwner}
        userRole={userRole}
        permissions={{ operational: hasAccess('operational'), orders: hasAccess('orders'), drivers: hasAccess('drivers') }}
      />
      <main style={{ marginLeft: '60px', flex: 1, height: '100vh', overflow: 'hidden', backgroundColor: '#0f0f0f' }}>
        <ErrorBoundary label={activePage}>
          {activePage === 'operational' && hasAccess('operational') && <Operational />}
          {activePage === 'orders'      && hasAccess('orders')      && <Orders />}
          {activePage === 'drivers'     && hasAccess('drivers')     && <Drivers />}
          {activePage === 'users'       && hasAccess('users')       && <UsersPage />}
          {Dev && activePage === 'dev' && hasAccess('dev') && <Suspense fallback={null}><Dev /></Suspense>}
          {activePage === 'settings'    && hasAccess('settings')    && <Settings />}
          {activePage === 'cardapio'    && hasAccess('cardapio')    && <Cardapio />}
          {activePage === 'estoque'     && hasAccess('estoque')     && <Estoque />}
          {activePage === 'social'      && hasAccess('social')      && <SocialMedia />}
        </ErrorBoundary>
      </main>
    </div>
  )
}
