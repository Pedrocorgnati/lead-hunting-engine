/**
 * TASK-15 intake-review (CL-173): fila local como fallback quando
 * trigger.dev nao esta disponivel (sem token ou request falha).
 *
 * Operacoes:
 *  - enqueue({kind, payload}) — idempotente via payload hash
 *  - leaseBatch({limit, leaseMs}) — pega N jobs PENDING com runAt<=now
 *    usando FOR UPDATE SKIP LOCKED (multi-replica safe)
 *  - ackDone(id) / ackFailed(id, error) — fecha o job
 *
 * Retry policy (ackFailed):
 *  - attempts < 3 -> runAt = now + 2^attempts min, status=PENDING
 *  - attempts >= 3 -> status=FAILED (Sentry capture feito pelo caller)
 */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

const DEFAULT_LEASE_MS = 120_000
const DEFAULT_BATCH = 10

export interface LocalQueueJobRow {
  id: string
  kind: string
  payload: Prisma.JsonValue
  attempts: number
}

export function hashPayload(payload: unknown): string {
  // JSON estavel: ordena chaves recursivamente para idempotencia robusta.
  const canonical = stableStringify(payload)
  return createHash('sha256').update(canonical).digest('hex')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`
}

export interface EnqueueInput {
  kind: string
  payload: Prisma.InputJsonValue
  runAt?: Date
}

export async function enqueue(input: EnqueueInput): Promise<{ id: string; created: boolean }> {
  const payloadHash = hashPayload(input.payload)
  const runAt = input.runAt ?? new Date()

  // Upsert by unique (kind, payloadHash) — idempotente.
  const existing = await prisma.localQueueJob.findUnique({
    where: { kind_payloadHash: { kind: input.kind, payloadHash } },
    select: { id: true },
  })
  if (existing) return { id: existing.id, created: false }

  const created = await prisma.localQueueJob.create({
    data: {
      kind: input.kind,
      payloadHash,
      payload: input.payload,
      runAt,
    },
    select: { id: true },
  })
  return { id: created.id, created: true }
}

export async function leaseBatch(options: {
  limit?: number
  leaseMs?: number
} = {}): Promise<LocalQueueJobRow[]> {
  const limit = options.limit ?? DEFAULT_BATCH
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  const leasedUntil = new Date(Date.now() + leaseMs)

  // FOR UPDATE SKIP LOCKED via raw SQL: Prisma nao expoe isso nativamente.
  const rows = await prisma.$queryRaw<Array<{
    id: string
    kind: string
    payload: Prisma.JsonValue
    attempts: number
  }>>`
    WITH picked AS (
      SELECT "id"
      FROM "local_queue_jobs"
      WHERE "status" = 'PENDING'
        AND "run_at" <= NOW()
      ORDER BY "run_at" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "local_queue_jobs" q
    SET
      "status" = 'LEASED',
      "leased_until" = ${leasedUntil},
      "attempts" = q."attempts" + 1
    FROM picked
    WHERE q."id" = picked."id"
    RETURNING q."id", q."kind", q."payload", q."attempts"
  `
  return rows
}

export async function ackDone(id: string): Promise<void> {
  await prisma.localQueueJob.update({
    where: { id },
    data: { status: 'DONE', leasedUntil: null, lastError: null },
  })
}

export async function ackFailed(id: string, error: string): Promise<{ terminal: boolean }> {
  const job = await prisma.localQueueJob.findUnique({
    where: { id },
    select: { attempts: true },
  })
  const attempts = job?.attempts ?? 0
  if (attempts >= 3) {
    await prisma.localQueueJob.update({
      where: { id },
      data: { status: 'FAILED', leasedUntil: null, lastError: error.slice(0, 2000) },
    })
    return { terminal: true }
  }
  const backoffMs = 60_000 * 2 ** attempts
  await prisma.localQueueJob.update({
    where: { id },
    data: {
      status: 'PENDING',
      leasedUntil: null,
      runAt: new Date(Date.now() + backoffMs),
      lastError: error.slice(0, 2000),
    },
  })
  return { terminal: false }
}

/** Requeue jobs com lease expirado (crash do worker). */
export async function reclaimExpired(): Promise<number> {
  const res = await prisma.$executeRaw`
    UPDATE "local_queue_jobs"
    SET "status" = 'PENDING', "leased_until" = NULL
    WHERE "status" = 'LEASED' AND "leased_until" < NOW()
  `
  return Number(res)
}
