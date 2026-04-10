/**
 * iFood integration must run in trusted backend.
 * This client module only calls backend functions and never handles secrets.
 */

import { syncIfood } from '../ifood'
import { supabase } from '../supabase'

const POLL_MS = 30_000
let pollInterval: ReturnType<typeof setInterval> | null = null

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function confirmIfoodDispatch(platformOrderId: string): Promise<void> {
  const orderId = platformOrderId.trim()
  if (!orderId) {
    throw new Error('platformOrderId invalido')
  }

  const { data, error } = await supabase.functions.invoke('ifood-dispatch-confirm', {
    body: { platformOrderId: orderId },
  })

  if (error) {
    throw new Error(`Falha ao confirmar despacho no backend: ${error.message}`)
  }

  if (data && typeof data === 'object' && 'ok' in data && (data as any).ok === false) {
    throw new Error(String((data as any).error ?? 'Falha ao confirmar despacho no iFood'))
  }
}

export function startIfoodPolling(storeId: string, _merchantId?: string): () => void {
  if (pollInterval || !storeId) return () => {}

  const run = () => {
    syncIfood(storeId).catch(err => {
      console.error('[iFood] polling error:', describeError(err))
    })
  }

  const timeout = setTimeout(run, 3_000)
  pollInterval = setInterval(run, POLL_MS)

  return () => {
    clearTimeout(timeout)
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }
}
