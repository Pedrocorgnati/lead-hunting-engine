'use client'

import { createBrowserClient } from '@supabase/ssr'

// TASK-18/ST001 (CL-012): sessao 24h + auto refresh explicitos.
// - persistSession: cookie-backed via @supabase/ssr (persiste entre tabs)
// - autoRefreshToken: true -> refresh ~5min antes de expirar
// - flowType: 'pkce' -> auth flow seguro padrao Supabase
// Janela de sessao efetiva e configurada no dashboard do Supabase
// (Settings -> Auth -> JWT expiry). Recomendado: 86400s (24h).
// Doc: docs/auth.md
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    },
  )
}
