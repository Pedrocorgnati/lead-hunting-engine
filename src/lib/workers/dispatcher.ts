/**
 * TASK-15 intake-review (CL-173): generic dispatcher com fallback local queue.
 *
 * Fluxo:
 *   dispatchJob({kind, payload, triggerFn})
 *     1. Tenta triggerFn (trigger.dev) com timeout 2s.
 *     2. Se falha (timeout/erro/sem token) -> enqueue() em LocalQueueJob.
 *     3. Idempotente via (kind, payloadHash).
 *
 * O processador roda em `/api/cron/drain-local-queue`.
 */
import type { Prisma } from '@prisma/client'
import { enqueue } from './local-queue'
import { captureException } from '@/lib/observability/sentry'

const DEFAULT_TRIGGER_TIMEOUT_MS = 2_000

export interface DispatchInput<T> {
  kind: string
  payload: T & Prisma.InputJsonValue
  /** Funcao opcional que dispara o job no provedor remoto. Se ausente ou lancar, cai no fallback local. */
  triggerFn?: (payload: T) => Promise<unknown>
  triggerTimeoutMs?: number
}

export interface DispatchResult {
  mode: 'trigger' | 'local_queue'
  jobId?: string
}

export async function dispatchJob<T>(input: DispatchInput<T>): Promise<DispatchResult> {
  const timeoutMs = input.triggerTimeoutMs ?? DEFAULT_TRIGGER_TIMEOUT_MS

  if (input.triggerFn && process.env.TRIGGER_SECRET_KEY) {
    try {
      await withTimeout(input.triggerFn(input.payload), timeoutMs)
      return { mode: 'trigger' }
    } catch (err) {
      captureException(err, { layer: 'dispatcher', kind: input.kind, mode: 'trigger-fallback' })
    }
  }

  const { id } = await enqueue({ kind: input.kind, payload: input.payload })
  return { mode: 'local_queue', jobId: id }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`trigger dispatch timeout after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}
