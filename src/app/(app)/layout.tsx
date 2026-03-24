export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { AppShell } from '@/components/shared/app-shell'
import { AuthProvider } from '@/components/shared/auth-provider'
import type { UserProfile } from '@/lib/hooks/use-auth'
import { getAuthenticatedUser } from '@/lib/auth'
import { Routes } from '@/lib/constants/routes'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const authUser = await getAuthenticatedUser()

  if (!authUser) {
    redirect(Routes.LOGIN)
  }

  // Seed initial data for AuthProvider — full profile fetched client-side via /api/v1/profile
  const initialUser: UserProfile = {
    id: authUser.id,
    email: authUser.email,
    name: null,
    role: authUser.role as UserProfile['role'],
  }

  return (
    <AuthProvider initialUser={initialUser}>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  )
}
