import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { Routes } from '@/lib/constants'
import type { UserRole } from '@prisma/client'

interface RoleGuardProps {
  children: React.ReactNode
  allowedRoles: UserRole[]
  fallbackUrl?: string
}

/**
 * Server component wrapper that protects content behind role-based access control.
 * Redirects to dashboard if the user does not have the required role.
 *
 * Usage: <RoleGuard allowedRoles={['ADMIN']}>{children}</RoleGuard>
 */
export async function RoleGuard({ children, allowedRoles, fallbackUrl = Routes.DASHBOARD }: RoleGuardProps) {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect(Routes.LOGIN)
  }

  if (!allowedRoles.includes(user.role)) {
    redirect(fallbackUrl)
  }

  return <>{children}</>
}
