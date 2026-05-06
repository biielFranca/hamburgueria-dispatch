import { supabase } from '../lib/supabase'
import type { Order } from '../types'

export async function fetchOrders(storeId: string) {
  return supabase
    .from('orders')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(500)
}

export async function updateOrder(id: string, patch: Partial<Order>) {
  return supabase.from('orders').update(patch).eq('id', id)
}

export async function insertOrder(order: Omit<Order, 'id' | 'created_at'>) {
  return supabase.from('orders').insert(order)
}

export async function deleteOrder(id: string) {
  return supabase.from('orders').delete().eq('id', id)
}

export function subscribeToOrders(
  storeId: string,
  onChange: (payload: unknown) => void
) {
  return supabase
    .channel(`orders:store_id=eq.${storeId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` }, onChange)
    .subscribe()
}

export async function fetchDispatchSuggestions(storeId: string) {
  return supabase
    .from('dispatch_suggestions')
    .select('*, dispatch_suggestion_orders(order_id)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
}

export async function updateDispatchSuggestion(id: string, patch: Record<string, unknown>) {
  return supabase.from('dispatch_suggestions').update(patch).eq('id', id)
}
