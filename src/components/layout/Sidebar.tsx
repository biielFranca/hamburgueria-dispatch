import type { Page } from '../../App'
import type { UserPermissions, UserRole } from '../../types'
import './Sidebar.css'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
  onLogout: () => void
  isOwner: boolean
  userRole: UserRole | null
  permissions: UserPermissions
}

export default function Sidebar({ activePage, onNavigate, onLogout, isOwner, userRole: _userRole, permissions }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <span className="sidebar-logo">D</span>
      </div>

      <nav className="sidebar-nav">
        {(isOwner || permissions.operational) && <button
          className={`sidebar-btn ${activePage === 'operational' ? 'active' : ''}`}
          onClick={() => onNavigate('operational')}
          title="Painel Operacional"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>}

        {(isOwner || permissions.orders) && <button
          className={`sidebar-btn ${activePage === 'orders' ? 'active' : ''}`}
          onClick={() => onNavigate('orders')}
          title="Pedidos"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <line x1="9" y1="12" x2="15" y2="12"/>
            <line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
        </button>}

        {(isOwner || permissions.drivers) && <button
          className={`sidebar-btn ${activePage === 'drivers' ? 'active' : ''}`}
          onClick={() => onNavigate('drivers')}
          title="Motoristas"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="10" r="3"/>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          </svg>
        </button>}

        {isOwner && <button
          className={`sidebar-btn ${activePage === 'users' ? 'active' : ''}`}
          onClick={() => onNavigate('users')}
          title="Usuários"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </button>}

      </nav>

      <div className="sidebar-bottom">
        <button
          className={`sidebar-btn ${activePage === 'dev' ? 'active' : ''}`}
          onClick={() => onNavigate('dev')}
          title="Dev / Testes"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="16 18 22 12 16 6"/>
            <polyline points="8 6 2 12 8 18"/>
          </svg>
        </button>

        {isOwner && <button
          className={`sidebar-btn ${activePage === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate('settings')}
          title="Configurações da Loja"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>}

        <button className="sidebar-btn" onClick={onLogout} title="Sair">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
