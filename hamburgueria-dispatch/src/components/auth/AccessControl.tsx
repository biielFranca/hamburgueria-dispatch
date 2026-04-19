import { createContext, useContext } from 'react'
import { useAuth } from './AuthBootstrap'
import type { UserRole, UserPermissions } from '../../types'
import type { Page } from '../../App'

interface AccessState {
  isOwner:   boolean
  userRole:  UserRole | null
  hasAccess: (page: Page) => boolean
}

const AccessContext = createContext<AccessState>({
  isOwner: false, userRole: null, hasAccess: () => false,
})

export function useAccess() {
  return useContext(AccessContext)
}

export function AccessControl({ children }: { children: React.ReactNode }) {
  const { userRole, permissions } = useAuth()
  const isOwner = userRole === 'owner' || userRole === 'admin'

  function hasAccess(page: Page): boolean {
    if (page === 'users'    && !isOwner) return false
    if (page === 'dev'      && userRole !== 'owner') return false
    if (page === 'settings' && userRole !== 'owner') return false
    if (page === 'cardapio' && !isOwner) return false
    if (page === 'estoque'  && !isOwner) return false
    if (page === 'social'   && !isOwner) return false
    if (!isOwner) {
      if (page === 'operational' && !permissions.operational) return false
      if (page === 'orders'      && !permissions.orders)      return false
      if (page === 'drivers'     && !permissions.drivers)     return false
    }
    return true
  }

  return (
    <AccessContext.Provider value={{ isOwner, userRole, hasAccess }}>
      {children}
    </AccessContext.Provider>
  )
}
