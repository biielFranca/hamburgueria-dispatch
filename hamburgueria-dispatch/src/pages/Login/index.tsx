import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import './Login.css'

export default function Login({ sessionExpired = false }: { sessionExpired?: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!username || !password) {
      setError('Preencha usuário e senha')
      return
    }

    setLoading(true)
    setError('')

    try {
      const normalizedUser = username.trim().toLowerCase()

      // busca o usuário pelo username para pegar o email usado no auth
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('username', normalizedUser)
        .eq('active', true)
        .single()

      if (userError || !userData) {
        setError('Usuário não encontrado ou inativo')
        setLoading(false)
        return
      }

      // faz login no supabase auth com o email vinculado
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: `${normalizedUser}@dispatch.internal`,
        password,
      })

      if (authError) {
        setError('Usuário ou senha incorretos')
        setLoading(false)
        return
      }

      // marca o momento do login para controle de expiração (8h)
      localStorage.setItem('dispatch_login_at', Date.now().toString())

    } catch {
      setError('Erro ao fazer login. Tente novamente.')
    }

    setLoading(false)
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-title">Dispatch</h1>
        <p className="login-subtitle">Central de despacho</p>

        <div className="login-form">
          <div className="login-field">
            <label>Usuário</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="seu usuário"
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

          {sessionExpired && !error && (
            <p className="login-error">Sua sessão expirou. Faça login novamente.</p>
          )}
          {error && <p className="login-error">{error}</p>}

          <button
            className="login-button"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </div>
    </div>
  )
}