import { createClient } from '@supabase/supabase-js'

const supabaseUrl      = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey  = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY as string | undefined

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client — only available when VITE_SUPABASE_SERVICE_KEY is set.
// Required for creating / updating auth users.
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        storageKey: 'dispatch-admin',
      },
    })
  : null