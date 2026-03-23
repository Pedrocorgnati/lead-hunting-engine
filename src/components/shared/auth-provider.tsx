'use client'

import { useState, useEffect, useCallback } from 'react'
import { AuthContext, UserProfile } from '@/lib/hooks/use-auth'
import { UserRole } from '@/lib/constants/enums'
import { createClient as createBrowserClient } from '@/lib/supabase/client'

interface AuthProviderProps {
  children: React.ReactNode
  initialUser?: UserProfile | null
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUser] = useState<UserProfile | null>(initialUser)
  const [loading, setLoading] = useState(!initialUser)

  const supabase = createBrowserClient()

  useEffect(() => {
    // TODO: Implementar com Supabase real — run /auto-flow execute
    setLoading(false)
  }, [])

  const signOut = useCallback(async () => {
    // TODO: Implementar com Supabase real
    await supabase.auth.signOut()
    setUser(null)
    window.location.href = '/login'
  }, [supabase])

  const isAdmin = user?.role === UserRole.ADMIN

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
