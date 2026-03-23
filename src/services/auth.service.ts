import type { SignInInput, ResetPasswordInput, UpdatePasswordInput } from '@/schemas/auth.schema'

export class AuthService {
  async signIn(data: SignInInput) {
    // TODO: Implementar via /auto-flow execute
    // Usa supabase.auth.signInWithPassword()
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async signOut() {
    // TODO: Implementar via /auto-flow execute
    // Usa supabase.auth.signOut()
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async resetPassword(data: ResetPasswordInput) {
    // TODO: Implementar via /auto-flow execute
    // Usa supabase.auth.resetPasswordForEmail()
    void data
    return { message: 'Se o email existir, você receberá um link de redefinição.' }
  }

  async updatePassword(userId: string, data: UpdatePasswordInput) {
    // TODO: Implementar via /auto-flow execute
    // Usa supabase.auth.updateUser()
    void userId
    void data
    throw new Error('Not implemented - run /auto-flow execute')
  }
}

export const authService = new AuthService()
