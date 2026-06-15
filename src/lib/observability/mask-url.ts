/**
 * Mascara segredos em URLs antes de logar/observabilidade (H-01/H-02).
 *
 * Varios providers passam a credencial em query string (Google Geocode/Places,
 * TomTom, HERE free tier, Instagram Graph access_token) porque a API exige.
 * Logar a URL crua (Sentry, console, mensagem de erro) vaza a chave. Esta funcao
 * redige params sensiveis e tambem `user:pass@` de URLs de proxy.
 */

const SENSITIVE_PARAMS = new Set([
  'key',
  'apikey',
  'api_key',
  'access_token',
  'token',
  'x-api-key',
  'auth',
  'password',
  'secret',
  'client_secret',
])

export function maskUrlSecrets(input: string): string {
  if (!input) return input
  try {
    const url = new URL(input)
    for (const [k] of url.searchParams) {
      if (SENSITIVE_PARAMS.has(k.toLowerCase())) url.searchParams.set(k, '***')
    }
    if (url.username || url.password) {
      url.username = url.username ? '***' : ''
      url.password = url.password ? '***' : ''
    }
    return url.toString()
  } catch {
    // Nao e URL valida (ex.: fragmento) — strip por regex como fallback.
    return input.replace(
      /([?&](?:key|apikey|api_key|access_token|token|auth|password|secret|client_secret)=)[^&\s]+/gi,
      '$1***',
    )
  }
}
