import { createClient } from '@/lib/supabase/server'

export class AuthService {
  static async signIn(email: string, password: string) {
    const supabase = await createClient()
    return supabase.auth.signInWithPassword({ email, password })
  }

  static async signOut() {
    const supabase = await createClient()
    return supabase.auth.signOut()
  }

  static async resetPassword(email: string, redirectTo: string) {
    const supabase = await createClient()
    return supabase.auth.resetPasswordForEmail(email, { redirectTo })
  }

  static async updatePassword(password: string) {
    const supabase = await createClient()
    return supabase.auth.updateUser({ password })
  }

  static async getSession() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session
  }

  static async getUser() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  }

  static async createInvite(email: string, options?: { data?: Record<string, unknown> }) {
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    return adminClient.auth.admin.inviteUserByEmail(email, options)
  }
}
