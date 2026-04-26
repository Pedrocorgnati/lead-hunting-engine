/**
 * Valida e normaliza o parametro `redirectTo` usado no pos-login apos
 * sessao expirada (TASK-6 / CL-189).
 *
 * Regras:
 * - Deve comecar com '/'
 * - Nao pode conter '//' (bloqueia protocol-relative URLs como '//evil.com')
 * - Nao pode conter '://' (bloqueia URLs absolutas com esquema)
 * - Nao pode comecar com '/api' ou '/login' (loop ou destino nao-UI)
 *
 * Retorna o path seguro ou o fallback (default '/dashboard').
 */
export function sanitizeRedirect(redirectTo: string | null | undefined, fallback = '/dashboard'): string {
  if (!redirectTo || typeof redirectTo !== 'string') return fallback
  const trimmed = redirectTo.trim()
  if (trimmed.length === 0) return fallback
  if (!trimmed.startsWith('/')) return fallback
  if (trimmed.startsWith('//')) return fallback
  if (trimmed.includes('://')) return fallback
  if (trimmed.startsWith('/api/')) return fallback
  if (trimmed.startsWith('/login')) return fallback
  return trimmed
}
