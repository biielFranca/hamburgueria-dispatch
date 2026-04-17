import type { Page } from '../../App'
import type { UserPermissions, UserRole } from '../../types'
import deliveryDispatchIcon from '../../assets/branding/delivery-dispatch-icon-square.png'
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
        <span className="sidebar-logo">
          <img src={deliveryDispatchIcon} alt="Delivery Dispatch" className="sidebar-logo-img" />
        </span>
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

        {isOwner && <button
          className={`sidebar-btn ${activePage === 'cardapio' ? 'active' : ''}`}
          onClick={() => onNavigate('cardapio')}
          title="Cardápio"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M3 3h18v4H3z"/>
            <path d="M3 7l2 14h14l2-14"/>
            <path d="M9 11a3 3 0 006 0"/>
          </svg>
        </button>}

        {isOwner && <button
          className={`sidebar-btn ${activePage === 'estoque' ? 'active' : ''}`}
          onClick={() => onNavigate('estoque')}
          title="Estoque"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
            <line x1="12" y1="12" x2="12" y2="17"/>
            <line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/>
          </svg>
        </button>}

        {isOwner && <button
          className={`sidebar-btn ${activePage === 'social' ? 'active' : ''}`}
          onClick={() => onNavigate('social')}
          title="Mídias Sociais"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
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
