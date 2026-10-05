/**
 * Dispatch confirmation for 99Food/Keeta own-delivery orders, through the
 * open-delivery-dispatch-confirm Edge Function. Orders themselves arrive by
 * webhook (food99-webhook / keeta-webhook). NOTE: 99Food now uses its own
 * protocol (Decision 015), so this path is pending a rewrite for both
 * platforms; callers treat it as best-effort.
 */

import { supabase } from '../supabase'

export async function confirmOpenDeliveryDispatch(
  platform: '99food' | 'keeta',
  platformOrderId: string,
): Promise<void> {
  const orderId = platformOrderId.trim()
  if (!orderId) throw new Error('platformOrderId inválido')

  const { data, error } = await supabase.functions.invoke('open-delivery-dispatch-confirm', {
    body: { platform, platformOrderId: orderId },
  })
  if (error) throw new Error(`Falha no backend open-delivery-dispatch-confirm: ${error.message}`)
  if (data?.ok === false) throw new Error(String(data.error ?? 'Falha ao confirmar despacho'))
}
