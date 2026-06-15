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
  /**
   * Apos enfileirar no fallback local, dispara um drain best-effort imediato
   * (fire-and-forget) para o job rodar sem esperar o cron de 2min. Default
   * true; em serverless o cron drain-local-queue continua sendo o backstop.
   */
  drainImmediately?: boolean
  /**
   * outreach-engine (06-10, task 01): pre-checagem obrigatoria ANTES de
   * qualquer dispatch outbound. `allowed=false` bloqueia o dispatch inteiro
   * (nem trigger nem fila) e o resultado registra os motivos — trilha
   * explicita de pre-checagem no fluxo.
   */
  gate?: () => Promise<{ allowed: boolean; reasons: string[] }>
}

export interface DispatchResult {
  mode: 'trigger' | 'local_queue' | 'blocked'
  jobId?: string
  blockedReasons?: string[]
}

export async function dispatchJob<T>(input: DispatchInput<T>): Promise<DispatchResult> {
  const timeoutMs = input.triggerTimeoutMs ?? DEFAULT_TRIGGER_TIMEOUT_MS

  if (input.gate) {
    const gate = await input.gate()
    if (!gate.allowed) {
      return { mode: 'blocked', blockedReasons: gate.reasons }
    }
  }

  if (input.triggerFn && process.env.TRIGGER_SECRET_KEY) {
    try {
      await withTimeout(input.triggerFn(input.payload), timeoutMs)
      return { mode: 'trigger' }
    } catch (err) {
      captureException(err, { layer: 'dispatcher', kind: input.kind, mode: 'trigger-fallback' })
    }
  }

  const { id } = await enqueue({ kind: input.kind, payload: input.payload })

  if (input.drainImmediately !== false) {
    // Fire-and-forget: roda o job agora no mesmo processo (next start /
    // self-hosted). Falha aqui nao bloqueia (o cron drain reprocessa), mas
    // P-13: registrar em vez de engolir — senao erro de drain fica invisivel.
    void import('./drain-local-queue')
      .then(({ runDrainLocalQueue }) => runDrainLocalQueue())
      .catch((err) => captureException(err, { layer: 'dispatcher', kind: input.kind, mode: 'immediate-drain' }))
  }

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
