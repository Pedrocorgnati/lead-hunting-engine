import { randomBytes } from 'node:crypto'

type Scope = string

interface ReauthEntry {
  id: string
  userId: string
  scope: Scope
  issuedAt: number
  expiresAt: number
}

interface ChallengeEntry {
  id: string
  userId: string
  scope: Scope
  phrase: string
  reauthId: string | null
  issuedAt: number
  expiresAt: number
  consumedAt: number | null
}

const DEFAULT_REAUTH_TTL_SEC = 15 * 60
const DEFAULT_CHALLENGE_TTL_SEC = 10 * 60
const MAX_STORE_SIZE = 20_000

const reauthStore = new Map<string, ReauthEntry>()
const challengeStore = new Map<string, ChallengeEntry>()
let lastCleanup = Date.now()

function cleanup(now = Date.now()) {
  if (now - lastCleanup < 30_000) return
  lastCleanup = now

  for (const [k, v] of reauthStore.entries()) {
    if (v.expiresAt <= now) reauthStore.delete(k)
  }
  for (const [k, v] of challengeStore.entries()) {
    if (v.expiresAt <= now || v.consumedAt) challengeStore.delete(k)
  }
}

function ensureCapacity() {
  if (reauthStore.size + challengeStore.size < MAX_STORE_SIZE) return
  cleanup(Date.now())
  if (reauthStore.size + challengeStore.size >= MAX_STORE_SIZE) {
    throw new Error('security store capacity exceeded')
  }
}

function normalizeScope(scope?: string | null): string {
  const cleaned = (scope ?? 'global').trim().toLowerCase()
  return cleaned.length > 0 ? cleaned : 'global'
}

export function issueReauthSession(input: { userId: string; scope?: string | null; ttlSeconds?: number }) {
  cleanup(Date.now())
  ensureCapacity()

  const ttlSec = Math.max(30, Math.min(3600, input.ttlSeconds ?? DEFAULT_REAUTH_TTL_SEC))
  const now = Date.now()
  const id = randomBytes(24).toString('base64url')

  const entry: ReauthEntry = {
    id,
    userId: input.userId,
    scope: normalizeScope(input.scope),
    issuedAt: now,
    expiresAt: now + ttlSec * 1000,
  }

  reauthStore.set(id, entry)

  return {
    reauthId: id,
    scope: entry.scope,
    issuedAt: new Date(entry.issuedAt).toISOString(),
    expiresAt: new Date(entry.expiresAt).toISOString(),
    ttlSeconds: ttlSec,
  }
}

export function validateReauthSession(input: { reauthId: string; userId: string; scope?: string | null }) {
  cleanup(Date.now())
  const entry = reauthStore.get(input.reauthId)
  if (!entry) return { ok: false as const, reason: 'NOT_FOUND' as const }

  if (entry.expiresAt <= Date.now()) {
    reauthStore.delete(input.reauthId)
    return { ok: false as const, reason: 'EXPIRED' as const }
  }

  if (entry.userId !== input.userId) return { ok: false as const, reason: 'OWNER_MISMATCH' as const }

  const expectedScope = normalizeScope(input.scope)
  if (expectedScope !== 'global' && entry.scope !== expectedScope) {
    return { ok: false as const, reason: 'SCOPE_MISMATCH' as const }
  }

  return { ok: true as const, entry }
}

export function issueChallenge(input: {
  userId: string
  phrase: string
  scope?: string | null
  reauthId?: string | null
  ttlSeconds?: number
}) {
  cleanup(Date.now())
  ensureCapacity()

  const ttlSec = Math.max(30, Math.min(3600, input.ttlSeconds ?? DEFAULT_CHALLENGE_TTL_SEC))
  const now = Date.now()
  const id = randomBytes(18).toString('base64url')

  const entry: ChallengeEntry = {
    id,
    userId: input.userId,
    scope: normalizeScope(input.scope),
    phrase: input.phrase.trim(),
    reauthId: input.reauthId?.trim() || null,
    issuedAt: now,
    expiresAt: now + ttlSec * 1000,
    consumedAt: null,
  }

  challengeStore.set(id, entry)

  return {
    challengeId: id,
    scope: entry.scope,
    phrase: entry.phrase,
    reauthId: entry.reauthId,
    issuedAt: new Date(entry.issuedAt).toISOString(),
    expiresAt: new Date(entry.expiresAt).toISOString(),
    ttlSeconds: ttlSec,
  }
}

export function verifyChallenge(input: {
  challengeId: string
  userId: string
  phrase: string
  scope?: string | null
  reauthId?: string | null
}) {
  cleanup(Date.now())
  const entry = challengeStore.get(input.challengeId)
  if (!entry) return { ok: false as const, reason: 'NOT_FOUND' as const }

  if (entry.consumedAt) return { ok: false as const, reason: 'ALREADY_CONSUMED' as const }

  if (entry.expiresAt <= Date.now()) {
    challengeStore.delete(input.challengeId)
    return { ok: false as const, reason: 'EXPIRED' as const }
  }

  if (entry.userId !== input.userId) return { ok: false as const, reason: 'OWNER_MISMATCH' as const }

  const expectedScope = normalizeScope(input.scope)
  if (expectedScope !== 'global' && entry.scope !== expectedScope) {
    return { ok: false as const, reason: 'SCOPE_MISMATCH' as const }
  }

  if (entry.reauthId && entry.reauthId !== (input.reauthId?.trim() || null)) {
    return { ok: false as const, reason: 'REAUTH_REQUIRED' as const }
  }

  if (entry.phrase !== input.phrase.trim()) return { ok: false as const, reason: 'PHRASE_MISMATCH' as const }

  entry.consumedAt = Date.now()
  challengeStore.set(entry.id, entry)

  return {
    ok: true as const,
    entry,
    verifiedAt: new Date(entry.consumedAt).toISOString(),
  }
}
