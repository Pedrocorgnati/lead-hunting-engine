export const dynamic = 'force-dynamic'

import { AppShell } from '@/components/shared/app-shell'
import { AuthProvider } from '@/components/shared/auth-provider'
import type { UserProfile } from '@/lib/hooks/use-auth'
import { UserRole } from '@/lib/constants/enums'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // TODO: Authenticate with real Supabase — run /auto-flow execute
  // Stub: always serve the app shell (auth guard is a no-op until backend is live)
  const mockUser: UserProfile = {
    id: 'demo',
    email: 'demo@leadhunting.app',
    name: 'Demo User',
    role: UserRole.ADMIN,
  }

  return (
    <AuthProvider initialUser={mockUser}>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  )
}
