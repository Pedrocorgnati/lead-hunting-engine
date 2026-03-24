import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { Routes } from '@/lib/constants'

interface AuthGuardProps {
  children: React.ReactNode
  fallbackUrl?: string
}

/**
 * Server component wrapper that protects content behind authentication.
 * Redirects to login if the user is not authenticated.
 *
 * Usage: <AuthGuard>{children}</AuthGuard>
 */
export async function AuthGuard({ children, fallbackUrl = Routes.LOGIN }: AuthGuardProps) {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect(fallbackUrl)
  }

  return <>{children}</>
}
