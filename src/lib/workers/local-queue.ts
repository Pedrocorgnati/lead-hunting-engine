import 'server-only'

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
 * Retry policy (ackFailed) — outreach-engine 06-10, task 03:
 *  - failureCount (falha de NEGOCIO, incrementado aqui) < 3 -> retry com
 *    backoff: runAt = now + 2^failureCount min, status=PENDING
 *  - failureCount >= 3 OU attempts >= 6 (crash-loop guard; attempts conta
 *    LEASES, inclui crashes) -> status=FAILED terminal
 *  - permanent=true (poison: payload irrecuperavel) -> FAILED imediato,
 *    sem retry — nunca entra em retry infinito
 *  - reason_code (taxonomia task 04) persistido na row para triagem
 *
 * Retencao (task 03): sweepQueueRetention() apaga DONE/FAILED antigos
 * conforme SystemConfig queue.retention (defaults 14/30 dias).
 */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type { ReasonCode } from './reason-codes'

const DEFAULT_LEASE_MS = 120_000
const DEFAULT_BATCH = 10
const MAX_BUSINESS_FAILURES = 3
const MAX_LEASE_ATTEMPTS = 6

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

  // Idempotente por unique (kind, payloadHash).
  const existing = await prisma.localQueueJob.findUnique({
    where: { kind_payloadHash: { kind: input.kind, payloadHash } },
    select: { id: true },
  })
  if (existing) return { id: existing.id, created: false }

  try {
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
  } catch (err) {
    // P-13: corrida — outro processo criou o mesmo (kind,payloadHash) entre o
    // findUnique e o create. A unique constraint impede duplicata; re-busca em
    // vez de propagar P2002 (que viraria FAILED/ruido espurio no drain).
    if ((err as { code?: string }).code === 'P2002') {
      const race = await prisma.localQueueJob.findUnique({
        where: { kind_payloadHash: { kind: input.kind, payloadHash } },
        select: { id: true },
      })
      if (race) return { id: race.id, created: false }
    }
    throw err
  }
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

export interface AckFailedOptions {
  /** Taxonomia de falha (task 04). Persistido na row; nunca nulo em falha critica. */
  reasonCode?: ReasonCode
  /** Poison (task 03): erro permanente — FAILED imediato, sem retry. */
  permanent?: boolean
}

export async function ackFailed(
  id: string,
  error: string,
  options: AckFailedOptions = {},
): Promise<{ terminal: boolean }> {
  const reasonCode = options.reasonCode ?? 'unknown'
  const job = await prisma.localQueueJob.findUnique({
    where: { id },
    select: { attempts: true, failureCount: true },
  })
  const attempts = job?.attempts ?? 0
  const failureCount = (job?.failureCount ?? 0) + 1

  const exhausted = failureCount >= MAX_BUSINESS_FAILURES || attempts >= MAX_LEASE_ATTEMPTS
  if (options.permanent === true || exhausted) {
    await prisma.localQueueJob.update({
      where: { id },
      data: {
        status: 'FAILED',
        leasedUntil: null,
        lastError: error.slice(0, 2000),
        failureCount,
        reasonCode,
      },
    })
    return { terminal: true }
  }

  // Backoff por falha de NEGOCIO (failureCount), nao por lease — crash de
  // worker (lease expirado) nao acelera o esgotamento do retry de negocio.
  const backoffMs = 60_000 * 2 ** (failureCount - 1)
  await prisma.localQueueJob.update({
    where: { id },
    data: {
      status: 'PENDING',
      leasedUntil: null,
      runAt: new Date(Date.now() + backoffMs),
      lastError: error.slice(0, 2000),
      failureCount,
      reasonCode,
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

// ── Retencao da fila (task 03) ────────────────────────────────────────────

let lastSweepAt = 0
const SWEEP_INTERVAL_MS = 60 * 60 * 1000 // 1x/hora por processo; delete idempotente

export interface QueueSweepResult {
  doneDeleted: number
  failedDeleted: number
  skipped: boolean
}

/**
 * Apaga rows DONE/FAILED alem da janela de retencao (SystemConfig
 * `queue.retention`, defaults 14/30 dias). Throttled a 1x/hora por processo
 * — chamado oportunisticamente pelo drain. `force` ignora o throttle (cron
 * dedicado/testes).
 */
export async function sweepQueueRetention(force = false): Promise<QueueSweepResult> {
  const now = Date.now()
  if (!force && now - lastSweepAt < SWEEP_INTERVAL_MS) {
    return { doneDeleted: 0, failedDeleted: 0, skipped: true }
  }
  lastSweepAt = now

  const { getQueueRetention } = await import('@/lib/services/system-config')
  const retention = await getQueueRetention()
  const doneBefore = new Date(now - retention.doneDays * 24 * 60 * 60 * 1000)
  const failedBefore = new Date(now - retention.failedDays * 24 * 60 * 60 * 1000)

  const [done, failed] = await Promise.all([
    prisma.localQueueJob.deleteMany({
      where: { status: 'DONE', createdAt: { lt: doneBefore } },
    }),
    prisma.localQueueJob.deleteMany({
      where: { status: 'FAILED', createdAt: { lt: failedBefore } },
    }),
  ])
  return { doneDeleted: done.count, failedDeleted: failed.count, skipped: false }
}

/** Testing only. */
export function _resetQueueSweepThrottle(): void {
  lastSweepAt = 0
}
