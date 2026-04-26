/**
 * Copy Token Store — opaque tokens com TTL curto para fluxo
 * "admin copia valor de credencial sem expor no DOM".
 *
 * TASK-23 intake-review (CL-079).
 *
 * Implementacao: em memoria (single-instance), mesmo pattern de
 * `src/lib/rate-limiter.ts`. Adequado para o plano atual (invite-only,
 * deploy single-instance no Vercel). Upgrade path: trocar `store` por
 * cliente Upstash/ioredis se houver multiplas instancias.
 *
 * Semantica:
 * - issueCopyToken() gera 32 bytes base64url, guarda em memoria com TTL 30s.
 * - consumeCopyToken() consome 1x (retorna + deleta atomic via delete apos get).
 * - Token usado 2x retorna null (endpoint mapeia para 410 Gone).
 */
import { randomBytes } from 'node:crypto'

interface CopyTokenEntry {
  provider: string
  actorId: string
  issuedAt: number
  expiresAt: number
}

const TOKEN_TTL_MS = 30_000
// R-06 intake-review: bounds defensivos contra memory DoS.
// - Cap global: qualquer pico acima de MAX_STORE_SIZE dispara GC agressivo.
// - Cap por actor: um admin malicioso nao pode gerar rapidamente mais que
//   MAX_TOKENS_PER_ACTOR tokens vivos simultaneamente.
const MAX_STORE_SIZE = 10_000
const MAX_TOKENS_PER_ACTOR = 20

const store = new Map<string, CopyTokenEntry>()
let lastCleanup = Date.now()

export class CopyTokenQuotaExceededError extends Error {
  constructor(actorId: string) {
    super(`copy-token quota exceeded for actor ${actorId}`)
    this.name = 'CopyTokenQuotaExceededError'
  }
}

function maybeCleanup(now: number): void {
  if (now - lastCleanup < 30_000) return
  lastCleanup = now
  for (const [token, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(token)
  }
}

function forceCleanup(now: number): void {
  lastCleanup = now
  for (const [token, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(token)
  }
}

function countActiveTokensForActor(actorId: string, now: number): number {
  let count = 0
  for (const entry of store.values()) {
    if (entry.actorId === actorId && entry.expiresAt > now) count++
  }
  return count
}

export function issueCopyToken(provider: string, actorId: string): string {
  const now = Date.now()
  maybeCleanup(now)

  // Se passou do cap global, roda GC imediato antes de checar quota.
  if (store.size >= MAX_STORE_SIZE) forceCleanup(now)

  const active = countActiveTokensForActor(actorId, now)
  if (active >= MAX_TOKENS_PER_ACTOR) {
    throw new CopyTokenQuotaExceededError(actorId)
  }

  if (store.size >= MAX_STORE_SIZE) {
    // Mesmo apos GC, store esta cheio — recusa para proteger o processo.
    throw new Error('copy-token store capacity exceeded')
  }

  const token = randomBytes(32).toString('base64url')
  store.set(token, {
    provider,
    actorId,
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  })
  return token
}

export function consumeCopyToken(token: string): CopyTokenEntry | null {
  const now = Date.now()
  maybeCleanup(now)

  const entry = store.get(token)
  if (!entry) return null

  // Consumo atomico (single-threaded na V8): delete antes de retornar.
  store.delete(token)
  if (entry.expiresAt <= now) return null
  return entry
}

export const _internal_forTests = {
  store,
  TOKEN_TTL_MS,
  MAX_STORE_SIZE,
  MAX_TOKENS_PER_ACTOR,
  countActiveTokensForActor,
}
