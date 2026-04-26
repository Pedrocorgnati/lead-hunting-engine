/**
 * R-05 intake-review: testes de copy-token store.
 * Pure unit — sem mocks externos, foco em TTL, one-shot, bound operacional.
 */
import {
  issueCopyToken,
  consumeCopyToken,
  CopyTokenQuotaExceededError,
  _internal_forTests,
} from '../copy-token-store'

const { store, MAX_TOKENS_PER_ACTOR } = _internal_forTests

describe('copy-token-store', () => {
  beforeEach(() => {
    // Limpa store entre testes (mesma instancia de modulo).
    store.clear()
  })

  it('issues a non-empty base64url token bound to provider+actor', () => {
    const t = issueCopyToken('GOOGLE_PLACES', 'admin-1')
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.length).toBeGreaterThan(20)
  })

  it('consume returns the entry then deletes it (one-shot)', () => {
    const t = issueCopyToken('GOOGLE_PLACES', 'admin-1')
    const first = consumeCopyToken(t)
    expect(first).not.toBeNull()
    expect(first?.provider).toBe('GOOGLE_PLACES')
    expect(first?.actorId).toBe('admin-1')

    const second = consumeCopyToken(t)
    expect(second).toBeNull()
  })

  it('returns null for completely unknown tokens', () => {
    expect(consumeCopyToken('not-a-real-token')).toBeNull()
  })

  it('consume returns null after TTL window (expired)', () => {
    const t = issueCopyToken('OPENAI', 'admin-2')
    // Simula expiracao mexendo direto no entry (pura unit).
    const entry = store.get(t)
    expect(entry).toBeDefined()
    if (entry) entry.expiresAt = Date.now() - 1
    expect(consumeCopyToken(t)).toBeNull()
  })

  it('enforces MAX_TOKENS_PER_ACTOR — emits quota error apos o cap', () => {
    const actor = 'spammy-admin'
    for (let i = 0; i < MAX_TOKENS_PER_ACTOR; i++) {
      expect(() => issueCopyToken('GOOGLE_PLACES', actor)).not.toThrow()
    }
    expect(() => issueCopyToken('GOOGLE_PLACES', actor)).toThrow(CopyTokenQuotaExceededError)
  })

  it('other actors still can issue tokens (quota is per-actor, not global)', () => {
    const actor = 'noisy-admin'
    for (let i = 0; i < MAX_TOKENS_PER_ACTOR; i++) {
      issueCopyToken('GOOGLE_PLACES', actor)
    }
    expect(() => issueCopyToken('GOOGLE_PLACES', 'clean-admin')).not.toThrow()
  })

  it('quota frees up after tokens are consumed', () => {
    const actor = 'recycling-admin'
    const tokens: string[] = []
    for (let i = 0; i < MAX_TOKENS_PER_ACTOR; i++) {
      tokens.push(issueCopyToken('OPENAI', actor))
    }
    // Consome um — quota deve liberar um slot.
    consumeCopyToken(tokens[0])
    expect(() => issueCopyToken('OPENAI', actor)).not.toThrow()
  })

  it('returned entry contains issuedAt and expiresAt timestamps', () => {
    const before = Date.now()
    const t = issueCopyToken('OPENAI', 'admin-ts')
    const after = Date.now()
    const entry = consumeCopyToken(t)
    expect(entry).not.toBeNull()
    expect(entry!.issuedAt).toBeGreaterThanOrEqual(before)
    expect(entry!.issuedAt).toBeLessThanOrEqual(after)
    expect(entry!.expiresAt).toBeGreaterThan(entry!.issuedAt)
  })
})
