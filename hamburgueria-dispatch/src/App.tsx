import { AuthBootstrap, useAuth } from './components/auth/AuthBootstrap'
import { AccessControl } from './components/auth/AccessControl'
import { AppNavigation } from './components/navigation/AppNavigation'
import AlertSystem from './components/AlertSystem'
import ClassifierService from './components/ClassifierService'
import RouteEngineService from './components/RouteEngineService'
import OfflineBanner from './components/OfflineBanner'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'

export type Page =
  | 'operational' | 'orders' | 'drivers' | 'users'
  | 'dev' | 'settings' | 'cardapio' | 'estoque' | 'social'

function AppShell() {
  const { session, loading, isReady, sessionExpired } = useAuth()

  if (loading) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#0f0f0f', color: '#666', fontSize: '14px',
      }}>
        Carregando...
      </div>
    )
  }

  if (!session) return <Login sessionExpired={sessionExpired} />

  // Wait for storeId/role to hydrate before mounting any data-bound UI.
  // Prevents background services from spinning up with null store_id.
  if (!isReady) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#0f0f0f', color: '#666', fontSize: '14px',
      }}>
        Carregando perfil...
      </div>
    )
  }

  return (
    <AccessControl>
      <AppNavigation />
      <OfflineBanner />
      <ErrorBoundary label="AlertSystem" fallback={() => null}><AlertSystem /></ErrorBoundary>
      <ErrorBoundary label="ClassifierService" fallback={() => null}><ClassifierService /></ErrorBoundary>
      <ErrorBoundary label="RouteEngineService" fallback={() => null}><RouteEngineService /></ErrorBoundary>
    </AccessControl>
  )
}

export default function App() {
  return (
    <AuthBootstrap>
      <AppShell />
    </AuthBootstrap>
  )
}
