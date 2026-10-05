/**
 * The app's only iFood module (roadmap 1.4). Everything that talks to iFood
 * runs in Edge Functions; this module only calls them with the user's JWT
 * (supabase.functions.invoke) and never handles secrets. The server derives
 * the store from the JWT — the app never names it.
 *
 * Orders arrive by webhook (ifood-webhook); syncIfood is the manual
 * reconciliation behind the "sincronizar agora" button in Settings.
 */

import { supabase } from '../supabase'

export interface IfoodSyncResult {
  inserted: number
  closed?:  number
  events:   number
  errors:   string[]
}

/** Pulls and applies pending iFood events for the logged-in user's store. */
export async function syncIfood(): Promise<IfoodSyncResult> {
  const { data, error } = await supabase.functions.invoke('ifood-sync', { body: {} })
  if (error) throw new Error(`Falha ao sincronizar com o iFood: ${error.message}`)
  if (data?.ok === false) throw new Error(String(data.error ?? 'Falha ao sincronizar com o iFood'))
  return data as IfoodSyncResult
}

/**
 * Tells iFood an own-delivery order left the store. NOTE: the Edge Function
 * ifood-dispatch-confirm does not exist yet (pending in the roadmap, with the
 * 99Food/Keeta equivalents), so this currently fails and callers treat it as
 * best-effort.
 */
export async function confirmIfoodDispatch(platformOrderId: string): Promise<void> {
  const orderId = platformOrderId.trim()
  if (!orderId) throw new Error('platformOrderId inválido')

  const { data, error } = await supabase.functions.invoke('ifood-dispatch-confirm', {
    body: { platformOrderId: orderId },
  })
  if (error) throw new Error(`Falha ao confirmar despacho no backend: ${error.message}`)
  if (data?.ok === false) throw new Error(String(data.error ?? 'Falha ao confirmar despacho no iFood'))
}
