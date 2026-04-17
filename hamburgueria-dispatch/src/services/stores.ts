import { supabase } from '../lib/supabase'
import type { Store } from '../types'

export async function fetchStore(storeId: string) {
  return supabase.from('stores').select('*').eq('id', storeId).single()
}

export async function updateStore(storeId: string, patch: Partial<Store>) {
  return supabase.from('stores').update(patch).eq('id', storeId)
}

export async function fetchStoreIntegrations(storeId: string) {
  return supabase.from('store_integrations').select('*').eq('store_id', storeId)
}

export async function upsertStoreIntegration(
  storeId: string,
  platform: string,
  payload: Record<string, unknown>
) {
  return supabase
    .from('store_integrations')
    .upsert({ store_id: storeId, platform, ...payload }, { onConflict: 'store_id,platform' })
}

export async function updateStoreIntegration(id: string, payload: Record<string, unknown>) {
  return supabase.from('store_integrations').update(payload).eq('id', id)
}
