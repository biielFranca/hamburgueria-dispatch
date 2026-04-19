import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase env vars ausentes: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env'
  )
}

if (/service[_-]?role|service[_-]?key/i.test(supabaseAnonKey)) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY parece ser uma service_role key — frontend deve usar apenas anon key. Operações admin vão via Edge Functions.'
  )
}

if (import.meta.env.VITE_SUPABASE_SERVICE_KEY) {
  throw new Error(
    'VITE_SUPABASE_SERVICE_KEY detectada no frontend. Remova do .env — service keys nunca devem ser bundled. Use Edge Functions para operações admin.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Creates an isolated auth client that does not persist or override UI session.
export function createEphemeralSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storageKey: 'dispatch-ephemeral-auth',
    },
  })
}
