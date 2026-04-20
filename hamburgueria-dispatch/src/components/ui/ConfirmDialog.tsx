import { useEffect } from 'react'

export type ConfirmVariant = 'danger' | 'default'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Styled confirmation dialog matching the app dark theme.
 * Replaces window.confirm() so messages stay inside the Tauri window.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
      if (e.key === 'Enter' && !loading) onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onCancel, onConfirm])

  if (!open) return null

  const isDanger = variant === 'danger'

  return (
    <div
      onClick={() => !loading && onCancel()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'cd-fade-in 120ms ease-out',
      }}
    >
      <style>{`
        @keyframes cd-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cd-pop-in {
          from { opacity: 0; transform: translateY(8px) scale(.98) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cd-title"
        style={{
          width: 'min(420px, 92vw)',
          background: '#141414',
          border: `1px solid ${isDanger ? '#5a1b1b' : '#262626'}`,
          borderRadius: 10,
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6)',
          color: '#e5e5e5',
          padding: '20px 22px 18px',
          animation: 'cd-pop-in 140ms ease-out',
        }}
      >
        <div
          id="cd-title"
          style={{
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 8,
            color: isDanger ? '#fca5a5' : '#f5f5f5',
            letterSpacing: 0.2,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: '#a3a3a3',
            marginBottom: 20,
          }}
        >
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '7px 14px',
              borderRadius: 6,
              border: '1px solid #2e2e2e',
              background: '#1c1c1c',
              color: '#d4d4d4',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            autoFocus
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '7px 14px',
              borderRadius: 6,
              border: `1px solid ${isDanger ? '#7a1f1f' : '#3a3a3a'}`,
              background: isDanger ? '#3a1111' : '#2a2a2a',
              color: isDanger ? '#fecaca' : '#f5f5f5',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
