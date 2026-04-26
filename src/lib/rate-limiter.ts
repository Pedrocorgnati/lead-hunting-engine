/**
 * Rate Limiter — fixed window, in-memory.
 * Adequate for invite-only B2B with limited concurrency.
 * Upgrade path: replace store with Upstash REST calls if multi-instance
 * rate limiting becomes necessary in production.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()
let lastCleanup = Date.now()

function maybeCleanup(now: number) {
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key)
  }
}

interface RateLimitResult {
  success: boolean
  retryAfter: number // seconds; 0 when success
  remaining: number
  reset: number      // Unix timestamp (seconds) when window resets
}

/**
 * Verifica e incrementa o contador de rate limit.
 * @param key  Identificador único (ex: "ip:10.0.0.1:login" or "jobs:create:userId")
 * @param limit Número máximo de requests permitidos na janela
 * @param windowSeconds Tamanho da janela em segundos (default 60s)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds = 60
): RateLimitResult {
  const now = Date.now()
  maybeCleanup(now)
  const entry = store.get(key)

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowSeconds * 1000
    store.set(key, { count: 1, resetAt })
    return { success: true, retryAfter: 0, remaining: limit - 1, reset: Math.floor(resetAt / 1000) }
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { success: false, retryAfter, remaining: 0, reset: Math.floor(entry.resetAt / 1000) }
  }

  entry.count += 1
  return { success: true, retryAfter: 0, remaining: limit - entry.count, reset: Math.floor(entry.resetAt / 1000) }
}

/**
 * Extrai o IP do request (compatível com Vercel/proxies).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

// ─── Error integrado com handleApiError ─────────────────────────────────────

export class RateLimitError extends Error {
  readonly code = 'RATE_001'
  readonly httpStatus = 429
  readonly retryAfter: number
  readonly reset: number

  constructor(retryAfter: number, reset: number) {
    super(`Você fez muitas requisições. Tente novamente em ${retryAfter}s.`)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
    this.reset = reset
  }
}

/**
 * Verifica o rate limit e lança RateLimitError se excedido.
 * Segue o mesmo padrão de requireAuth() — pode ser usado com try/catch + handleApiError.
 */
export function assertRateLimit(key: string, limit: number, windowSeconds = 60): void {
  const result = checkRateLimit(key, limit, windowSeconds)
  if (!result.success) {
    throw new RateLimitError(result.retryAfter, result.reset)
  }
}

// ─── Limiters pré-configurados (limites do THREAT-MODEL.md) ─────────────────

/**
 * Wrappers prontos para cada endpoint crítico.
 * Uso: `limits.createJob(user.id)` — lança RateLimitError se excedido.
 */
export const limits = {
  /** POST /api/v1/jobs — 5 req/min por usuário */
  createJob: (userId: string) => assertRateLimit(`jobs:create:${userId}`, 5),

  /** GET /api/v1/leads — 60 req/min por usuário */
  listLeads: (userId: string) => assertRateLimit(`leads:list:${userId}`, 60),

  /** POST /api/v1/export — 5 req/min por usuário (query pesada) */
  exportLeads: (userId: string) => assertRateLimit(`leads:export:${userId}`, 5),

  /** POST /api/v1/leads/[id]/pitch — 10 req/min por usuário (custo LLM) */
  generatePitch: (userId: string) => assertRateLimit(`pitch:generate:${userId}`, 10),

  /** TASK-2/ST008 (CL-317): POST /api/v1/waitlist|contact|consent — 5 req/min por IP */
  landingForms: (ip: string) => assertRateLimit(`landing-forms:${ip}`, 5),

  /**
   * TASK-18/ST003 (CL-043): POST /api/v1/auth/verify-password — 3 req/min.
   * R-13 intake-review: aplicar DOIS buckets independentes (user OR IP) para
   * bloquear credential stuffing horizontal entre contas vindo do mesmo IP.
   */
  authVerify: (userId: string) => assertRateLimit(`auth-verify:user:${userId}`, 3),
  authVerifyByIp: (ip: string) => assertRateLimit(`auth-verify:ip:${ip}`, 10),
} as const
