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
      const { data } = await apiClient.get<UserProfile>('/api/v1/profile')
      return data ?? null
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
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.push(Routes.LOGIN)
  }, [getSupabase, router])

  const isAdmin = user?.role === UserRole.ADMIN

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
