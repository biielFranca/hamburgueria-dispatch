import { supabase } from '../lib/supabase'
import type { Driver } from '../types'

export async function fetchDrivers(storeId: string) {
  return supabase
    .from('drivers')
    .select('*')
    .eq('store_id', storeId)
    .order('name')
    .limit(200)
}

export async function insertDriver(driver: Omit<Driver, 'id' | 'created_at'>) {
  return supabase.from('drivers').insert(driver)
}

export async function updateDriver(id: string, patch: Partial<Driver>) {
  return supabase.from('drivers').update(patch).eq('id', id)
}

export async function deleteDriver(id: string) {
  return supabase.from('drivers').delete().eq('id', id)
}

export function subscribeToDrivers(
  storeId: string,
  onChange: (payload: unknown) => void
) {
  return supabase
    .channel(`drivers:store_id=eq.${storeId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `store_id=eq.${storeId}` }, onChange)
    .subscribe()
}
