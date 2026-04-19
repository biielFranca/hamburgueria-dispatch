import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
  label?: string
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ''}]`, error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset)
      return (
        <div style={{
          padding: 24,
          color: '#e5e5e5',
          background: '#1a1a1a',
          borderRadius: 8,
          border: '1px solid #3a1a1a',
          maxWidth: 520,
          margin: '40px auto',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h2 style={{ margin: '0 0 8px', color: '#f87171', fontSize: 16 }}>
            Algo deu errado{this.props.label ? ` em ${this.props.label}` : ''}
          </h2>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#888', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </p>
          <button
            onClick={this.reset}
            style={{
              padding: '6px 14px',
              background: '#2a2a2a',
              color: '#e5e5e5',
              border: '1px solid #3a3a3a',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
