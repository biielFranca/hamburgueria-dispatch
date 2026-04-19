import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const signInWithPassword = vi.fn()
  const signOut = vi.fn()
  const getSession = vi.fn()
  const getUser = vi.fn()
  const onAuthStateChange = vi.fn()
  const single = vi.fn()
  const eq = vi.fn(() => ({ single }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return {
    supabase: {
      auth: { signInWithPassword, signOut, getSession, getUser, onAuthStateChange },
      from,
    },
    signInWithPassword, signOut, getSession, getUser, onAuthStateChange,
    single, eq, select, from,
  }
})

vi.mock('../lib/supabase', () => ({ supabase: mocks.supabase }))

import { signIn, signOut, getSession, getCurrentUser, fetchUserRole, onAuthStateChange } from './auth'

describe('services/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signIn synthesizes @dispatch.local email', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null })
    await signIn('joao', 'pw')
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'joao@dispatch.local',
      password: 'pw',
    })
  })

  it('signOut delegates to supabase.auth.signOut', async () => {
    mocks.signOut.mockResolvedValue({ error: null })
    await signOut()
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })

  it('getSession / getCurrentUser delegate', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    await getSession()
    await getCurrentUser()
    expect(mocks.getSession).toHaveBeenCalledTimes(1)
    expect(mocks.getUser).toHaveBeenCalledTimes(1)
  })

  it('fetchUserRole returns role+permissions', async () => {
    mocks.single.mockResolvedValue({
      data: { role: 'owner', permissions: { operational: true, orders: true, drivers: true } },
      error: null,
    })
    const result = await fetchUserRole('auth-123')
    expect(mocks.from).toHaveBeenCalledWith('users')
    expect(mocks.eq).toHaveBeenCalledWith('auth_id', 'auth-123')
    expect(result?.role).toBe('owner')
  })

  it('fetchUserRole returns null when no data', async () => {
    mocks.single.mockResolvedValue({ data: null, error: null })
    const result = await fetchUserRole('missing')
    expect(result).toBeNull()
  })

  it('onAuthStateChange forwards callback', () => {
    const cb = vi.fn()
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    onAuthStateChange(cb)
    expect(mocks.onAuthStateChange).toHaveBeenCalledWith(cb)
  })
})
