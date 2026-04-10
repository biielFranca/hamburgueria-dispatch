import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

export interface IfoodSyncResult {
  inserted: number
  events:   number
  errors:   string[]
}

export interface IfoodTestResult {
  ok:     boolean
  events: number
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ifood-sync`
const ANON   = import.meta.env.VITE_SUPABASE_ANON_KEY

// Use Tauri's HTTP plugin inside the app window; fall back to native fetch in browser
const httpFetch: typeof globalThis.fetch =
  (window as any).__TAURI_INTERNALS__ ? (tauriFetch as any) : globalThis.fetch

async function callFn(payload: object): Promise<Record<string, any>> {
  const res = await httpFetch(FN_URL, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey:         ANON,
      Authorization:  `Bearer ${ANON}`,
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

export async function testIfoodCredentials(
  clientId: string,
  clientSecret: string,
): Promise<IfoodTestResult> {
  const data = await callFn({ testMode: true, clientId, clientSecret })
  if (!data.ok) throw new Error(data.error ?? 'Falha ao conectar com o iFood')
  return data as IfoodTestResult
}
