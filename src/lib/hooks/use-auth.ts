'use client'

import { createContext, useContext } from 'react'
import { UserRole } from '@/lib/constants/enums'

export interface UserProfile {
  id: string
  email: string
  name: string | null
  role: UserRole
  avatarUrl?: string | null
  termsAcceptedAt?: Date | null
  deletionRequestedAt?: Date | null
}

interface AuthContextValue {
  user: UserProfile | null
  loading: boolean
  isAdmin: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isAdmin: false,
  signOut: async () => {},
})

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
