import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { supabase } from './supabase'

export interface IfoodSyncResult {
  inserted: number
  events:   number
  errors:   string[]
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ifood-sync`
const ANON   = import.meta.env.VITE_SUPABASE_ANON_KEY

// Use Tauri's HTTP plugin inside the app window; fall back to native fetch in browser
const httpFetch: typeof globalThis.fetch =
  (window as any).__TAURI_INTERNALS__ ? (tauriFetch as any) : globalThis.fetch

async function callFn(payload: object): Promise<Record<string, any>> {
  // ifood-sync derives the store from the user's JWT — the anon key alone
  // is rejected with 401.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão expirada — faça login novamente')

  const res = await httpFetch(FN_URL, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey:         ANON,
      Authorization:  `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (!text.trim()) throw new Error(`Resposta vazia — status ${res.status}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Resposta inválida (${res.status}): ${text.slice(0, 300)}`)
  }
}

export async function syncIfood(storeId: string): Promise<IfoodSyncResult> {
  const data = await callFn({ storeId })
  if (!data.ok && data.error) throw new Error(data.error)
  return data as IfoodSyncResult
}
