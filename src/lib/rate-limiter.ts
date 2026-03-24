/**
 * Rate Limiter — in-memory, por IP
 * Adequado para instância única. Para multi-instância, usar Upstash Redis.
 * Referência: TASK-0/ST002, COMP-004
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

// Mapa global de contadores por chave (ip:endpoint)
const store = new Map<string, RateLimitEntry>()

// Limpeza periódica para evitar memory leak (a cada 5 minutos)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) store.delete(key)
    }
  }, 5 * 60 * 1000)
}

interface RateLimitResult {
  success: boolean
  /** Segundos até o reset */
  retryAfter: number
}

/**
 * Verifica e incrementa o contador de rate limit.
 * @param key  Identificador único (ex: "ip:10.0.0.1:invites-get")
 * @param limit Número máximo de requests permitidos na janela
 * @param windowSeconds Tamanho da janela em segundos (default 60s)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds = 60
): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { success: true, retryAfter: 0 }
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { success: false, retryAfter }
  }

  entry.count += 1
  return { success: true, retryAfter: 0 }
}

/**
 * Extrai o IP do request (compatível com Vercel/proxies).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
