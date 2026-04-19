import { supabase } from '../lib/supabase'
import type { UserPermissions, UserRole } from '../types'

export async function signIn(username: string, password: string) {
  const email = `${username}@dispatch.local`
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getSession() {
  return supabase.auth.getSession()
}

export async function getCurrentUser() {
  return supabase.auth.getUser()
}

export async function fetchUserRole(authId: string): Promise<{ role: UserRole; permissions: UserPermissions } | null> {
  const { data } = await supabase
    .from('users')
    .select('role, permissions')
    .eq('auth_id', authId)
    .single()
  return data ?? null
}

export function onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
  return supabase.auth.onAuthStateChange(callback)
}
