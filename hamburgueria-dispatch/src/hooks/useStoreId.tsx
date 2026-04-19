import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

type StoreIdState = {
  storeId: string | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const StoreIdContext = createContext<StoreIdState | null>(null)

export function StoreIdProvider({ children }: { children: ReactNode }) {
  const [storeId, setStoreId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      setStoreId(null)
      setLoading(false)
      return
    }
    const { data, error: dbError } = await supabase
      .from('users').select('store_id').eq('auth_id', authData.user.id).single()
    if (dbError) setError(dbError.message)
    setStoreId(data?.store_id ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setStoreId(null)
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') load()
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <StoreIdContext.Provider value={{ storeId, loading, error, refresh: load }}>
      {children}
    </StoreIdContext.Provider>
  )
}

export function useStoreId(): StoreIdState {
  const ctx = useContext(StoreIdContext)
  if (!ctx) throw new Error('useStoreId deve ser usado dentro de <StoreIdProvider>')
  return ctx
}
