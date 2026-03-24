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
  const supabaseRef = useRef(createBrowserClient())
  const supabase = supabaseRef.current

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
    // Hydrate full profile if we only have partial initial data
    if (initialUser && !initialUser.name) {
      fetchProfile().then((profile) => {
        if (profile) setUser(profile)
        setLoading(false)
      })
    } else {
      setLoading(false)
    }

    // Subscribe to auth state changes
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
      subscription.unsubscribe()
    }
  }, [supabase, fetchProfile, initialUser, router])

  const signOut = useCallback(async () => {
    setUser(null)
    await supabase.auth.signOut()
    router.push(Routes.LOGIN)
  }, [supabase, router])

  const isAdmin = user?.role === UserRole.ADMIN

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
