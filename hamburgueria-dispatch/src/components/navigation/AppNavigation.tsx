import { useState } from 'react'
import { useAccess } from '../auth/AccessControl'
import { useAuth } from '../auth/AuthBootstrap'
import Sidebar from '../layout/Sidebar'
import Orders from '../../pages/Orders'
import Operational from '../../pages/Operational'
import Drivers from '../../pages/Drivers'
import UsersPage from '../../pages/Users'
import Dev from '../../pages/Dev'
import Settings from '../../pages/Settings'
import Cardapio from '../../pages/Cardapio'
import Estoque from '../../pages/Estoque'
import SocialMedia from '../../pages/SocialMedia'
import ErrorBoundary from '../ErrorBoundary'
import type { Page } from '../../App'

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
          {activePage === 'dev'         && hasAccess('dev')         && <Dev />}
          {activePage === 'settings'    && hasAccess('settings')    && <Settings />}
          {activePage === 'cardapio'    && hasAccess('cardapio')    && <Cardapio />}
          {activePage === 'estoque'     && hasAccess('estoque')     && <Estoque />}
          {activePage === 'social'      && hasAccess('social')      && <SocialMedia />}
        </ErrorBoundary>
      </main>
    </div>
  )
}
