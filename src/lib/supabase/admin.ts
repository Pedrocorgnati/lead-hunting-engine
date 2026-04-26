import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

/**
 * Supabase admin client (service-role).
 * Uso restrito: operacoes privilegiadas do backend (signOut global,
 * admin.listUsers, admin.deleteUser). NUNCA expor no bundle client-side.
 * Cookies ignorados por design — autenticacao aqui e via JWT de servico.
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase admin client: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.')
  }

  cached = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  return cached
}
