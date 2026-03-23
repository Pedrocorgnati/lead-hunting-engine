import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { errorResponse, AUTH_001, AUTH_004 } from '@/constants/errors'
import type { UserRole } from '@prisma/client'

export interface AuthenticatedUser {
  id: string
  email: string
  role: UserRole
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) return null

  const profile = await prisma.userProfile.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, role: true },
  })

  return profile
}

export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser()
  if (!user) throw new AuthError('UNAUTHORIZED')
  return user
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await requireAuth()
  if (user.role !== 'ADMIN') throw new AuthError('FORBIDDEN')
  return user
}

export class AuthError extends Error {
  type: 'UNAUTHORIZED' | 'FORBIDDEN'

  constructor(type: 'UNAUTHORIZED' | 'FORBIDDEN') {
    super(type === 'UNAUTHORIZED' ? 'Not authenticated' : 'Insufficient permissions')
    this.type = type
  }
}

export function handleAuthError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    if (error.type === 'UNAUTHORIZED') {
      return NextResponse.json(errorResponse(AUTH_001), { status: 401 })
    }
    return NextResponse.json(errorResponse(AUTH_004), { status: 403 })
  }
  throw error
}
