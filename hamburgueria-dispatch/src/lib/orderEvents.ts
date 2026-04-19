/**
 * Append-only audit log for order lifecycle transitions.
 *
 * Writes to public.order_events (see 20260419_order_events.sql). Errors are
 * swallowed — the audit trail must never block the primary write path.
 */

import { supabase } from './supabase'

export type OrderEventType =
  | 'received'
  | 'normalized'
  | 'classified'
  | 'route_suggested'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'timeout'
  | 'rejected'
  | 'manually_edited'
  | 'status_changed'

export type ActorType = 'system' | 'operator' | 'platform' | 'driver'

export interface LogOrderEventInput {
  orderId:   string
  storeId:   string
  eventType: OrderEventType
  actorType?: ActorType
  actorId?:  string | null
  previous?: Record<string, unknown> | null
  next?:     Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export async function logOrderEvent(input: LogOrderEventInput): Promise<void> {
  try {
    const { error } = await supabase.from('order_events').insert({
      order_id:   input.orderId,
      store_id:   input.storeId,
      event_type: input.eventType,
      actor_type: input.actorType ?? 'system',
      actor_id:   input.actorId ?? null,
      previous:   input.previous ?? null,
      next:       input.next ?? null,
      metadata:   input.metadata ?? null,
    })
    if (error) console.warn('[orderEvents] insert failed:', error.message)
  } catch (e) {
    console.warn('[orderEvents] unexpected error:', e)
  }
}

export async function fetchOrderEvents(orderId: string) {
  const { data, error } = await supabase
    .from('order_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) return []
  return data ?? []
}
