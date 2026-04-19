import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { isEmail, isInternalEmail, resolveLoginEmail } from '../../lib/authHelpers'
import deliveryDispatchLogo from '../../assets/branding/delivery-dispatch-logo-full.png'
import './Login.css'

export default function Login({ sessionExpired = false }: { sessionExpired?: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!username || !password) {
      setError('Preencha usuário/email e senha')
      return
    }

    setLoading(true)
    setError('')
    setInfo('')

    try {
      const email = resolveLoginEmail(username)
      if (!email) {
        setError('Formato de usuário/email inválido')
        setLoading(false)
        return
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError('Credenciais inválidas')
        setLoading(false)
        return
      }

      localStorage.setItem('dispatch_login_at', Date.now().toString())
    } catch {
      setError('Erro ao fazer login. Tente novamente.')
    }

    setLoading(false)
  }

  async function handleResetPassword() {
    setError('')
    setInfo('')
    const input = username.trim().toLowerCase()
    if (!isEmail(input)) {
      setError('Digite seu email real para recuperar a senha')
      return
    }
    if (isInternalEmail(input)) {
      setError('Recuperação indisponível para contas legadas — peça ao admin para resetar')
      return
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(input)
    if (resetError) {
      setError(resetError.message)
      return
    }
    setInfo('Se o email existir, enviaremos instruções de recuperação.')
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <img src={deliveryDispatchLogo} alt="Delivery Dispatch" className="login-logo" />

        <div className="login-form">
          <div className="login-field">
            <label>Usuário ou email</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.replace(/\s/g, ''))}
              placeholder="usuário ou email@dominio.com"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>

          <div className="login-field">
            <label>Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="sua senha"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>

          {sessionExpired && !error && !info && (
            <p className="login-error">Sua sessão expirou. Faça login novamente.</p>
          )}
          {error && <p className="login-error">{error}</p>}
          {info && <p className="login-info">{info}</p>}

          <button
            className="login-button"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <button
            type="button"
            className="login-link"
            onClick={handleResetPassword}
            disabled={loading}
          >
            Esqueci minha senha
          </button>
        </div>
      </div>
    </div>
  )
}
