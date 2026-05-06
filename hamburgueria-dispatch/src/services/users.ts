import { supabase } from '../lib/supabase'
import type { User, UserPermissions } from '../types'

export async function fetchUsers(storeId: string) {
  return supabase
    .from('users')
    .select('*')
    .eq('store_id', storeId)
    .order('name')
    .limit(200)
}

export async function insertUser(user: Omit<User, 'id' | 'created_at'>) {
  return supabase.from('users').insert(user)
}

export async function updateUser(id: string, patch: Partial<User>) {
  return supabase.from('users').update(patch).eq('id', id)
}

export async function updateUserPermissions(id: string, permissions: UserPermissions) {
  return supabase.from('users').update({ permissions }).eq('id', id)
}

export async function setUserActive(id: string, active: boolean) {
  return supabase.from('users').update({ active }).eq('id', id)
}
