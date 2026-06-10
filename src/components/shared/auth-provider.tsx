'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AuthContext, UserProfile } from '@/lib/hooks/use-auth'
import { UserRole, Routes } from '@/lib/constants'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { apiClient } from '@/lib/utils/api-client'

interface AuthProviderProps {
  children: React.ReactNode
  initialUser?: UserProfile | null
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUser] = useState<UserProfile | null>(initialUser)
  const [loading, setLoading] = useState(!initialUser)
  const router = useRouter()
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)

  const getSupabase = useCallback((): ReturnType<typeof createBrowserClient> => {
    if (!supabaseRef.current) {
      supabaseRef.current = createBrowserClient()
    }
    return supabaseRef.current
  }, [])

  // Fetch full profile from API (includes name, avatarUrl, etc.)
  const fetchProfile = useCallback(async (): Promise<UserProfile | null> => {
    try {
      // apiClient devolve o BODY bruto em `data` — o endpoint envelopa em
      // {data: profile}, entao e preciso desembrulhar DUAS vezes. O unwrap
      // simples setava user={data:{...}} (role/name/email undefined): admin
      // nunca via a secao Admin da sidebar e o header quebrava.
      const { data } = await apiClient.get<{ data: UserProfile }>('/api/v1/profile')
      return data?.data ?? null
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    let mounted = true
    void (async () => {
      if (initialUser && !initialUser.name) {
        const profile = await fetchProfile()
        if (!mounted) return
        if (profile) setUser(profile)
      }
      if (mounted) setLoading(false)
    })()

    // Subscribe to auth state changes
    const supabase = getSupabase()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        router.push(Routes.LOGIN)
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const profile = await fetchProfile()
        if (profile) setUser(profile)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile, getSupabase, initialUser, router])

  const signOut = useCallback(async () => {
    setUser(null)
    // Logout SERVER-SIDE primeiro: limpa os cookies httpOnly na resposta.
    // So o signOut client deixava cookie residual e o middleware devolvia
    // /login -> /dashboard (Sair nao deslogava; bug pego pelo e2e).
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' })
    } catch {
      // segue para o signOut local mesmo assim
    }
    try {
      const supabase = getSupabase()
      await supabase.auth.signOut()
    } catch {
      // cookies ja limpos pelo endpoint; redirect nao depende disso
    } finally {
      // Full reload: garante que nenhum cache RSC/router mantenha o shell logado
      window.location.assign(Routes.LOGIN)
    }
  }, [getSupabase])

  const isAdmin = user?.role === UserRole.ADMIN

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
