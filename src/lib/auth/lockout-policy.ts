/**
 * Auth Lockout Policy — backoff exponencial por usuario.
 *
 * Cobre: TASK-4/ST001 (CL-038).
 *
 * - Modulo puro: sem dependencias de request ou framework.
 * - Store: reusa o mesmo Map in-memory do rate-limiter (suficiente para
 *   invite-only B2B; upgrade path: Upstash Redis).
 * - Config via env: AUTH_LOCKOUT_THRESHOLD, AUTH_LOCKOUT_COOLDOWN_MIN, AUTH_LOCKOUT_MAX_DELAY_MS.
 */

interface LockoutEntry {
  attemptCount: number
  lockedUntil: number | null
  lastAttempt: number
}

const lockoutStore = new Map<string, LockoutEntry>()

export const LOCKOUT_THRESHOLD = parseInt(process.env.AUTH_LOCKOUT_THRESHOLD ?? '3', 10)
const THRESHOLD = LOCKOUT_THRESHOLD
const COOLDOWN_MS =
  parseInt(process.env.AUTH_LOCKOUT_COOLDOWN_MIN ?? '30', 10) * 60 * 1000
const MAX_DELAY_MS = parseInt(process.env.AUTH_LOCKOUT_MAX_DELAY_MS ?? '300000', 10)

/**
 * Calcula o delay de backoff em ms para a N-esima tentativa falha.
 * Retorna 0 para tentativas <= threshold (sem bloqueio).
 */
export function computeBackoffMs(attemptCount: number): number {
  if (attemptCount <= THRESHOLD) return 0
  const exponent = attemptCount - THRESHOLD
  return Math.min(1000 * Math.pow(2, exponent), MAX_DELAY_MS)
}

/**
 * Estado atual de lockout para a key.
 */
export function getLockState(userKey: string): {
  lockedUntil: number | null
  attemptCount: number
} {
  const now = Date.now()
  const entry = lockoutStore.get(userKey)
  if (!entry) return { lockedUntil: null, attemptCount: 0 }

  // Cooldown expirou: reset automatico
  if (entry.lastAttempt + COOLDOWN_MS < now) {
    lockoutStore.delete(userKey)
    return { lockedUntil: null, attemptCount: 0 }
  }

  // Lock expirou mas cooldown ainda ativo: manter contador
  if (entry.lockedUntil !== null && entry.lockedUntil <= now) {
    return { lockedUntil: null, attemptCount: entry.attemptCount }
  }

  return { lockedUntil: entry.lockedUntil, attemptCount: entry.attemptCount }
}

/**
 * Registra falha de autenticacao para a key.
 * Calcula novo lockedUntil com backoff exponencial.
 */
export function recordFailure(userKey: string): void {
  const now = Date.now()
  const existing = lockoutStore.get(userKey)
  const prevCount = existing?.attemptCount ?? 0
  const newCount = prevCount + 1
  const backoffMs = computeBackoffMs(newCount)
  lockoutStore.set(userKey, {
    attemptCount: newCount,
    lockedUntil: backoffMs > 0 ? now + backoffMs : null,
    lastAttempt: now,
  })
}

/**
 * Registra autenticacao bem-sucedida — reseta contador.
 */
export function recordSuccess(userKey: string): void {
  lockoutStore.delete(userKey)
}
