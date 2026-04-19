import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export default function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 60,
        right: 0,
        zIndex: 9500,
        padding: '6px 16px',
        background: '#7f1d1d',
        color: '#fee2e2',
        fontSize: 12,
        fontWeight: 600,
        textAlign: 'center',
        letterSpacing: 0.2,
        boxShadow: '0 2px 8px rgba(0,0,0,.5)',
      }}
    >
      ⚠ Sem conexão — alterações não serão salvas até voltar online
    </div>
  )
}
