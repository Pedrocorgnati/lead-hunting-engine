/**
 * Acoes de recuperacao de erros de coleta (retry / retry-all / ignore).
 *
 * Substitui os stubs que devolviam sucesso sem efeito (falso sucesso, anti
 * Zero Silencio). Semantica real:
 *  - status do erro e PERSISTIDO de volta no `errorLog` do CollectionJob em
 *    forma canonica (round-trip estavel com buildErrorList);
 *  - reprocessamento reutiliza o maquinario existente:
 *      FAILED          -> child job com retriedFromId + tasks.trigger('collect-leads')
 *      PAUSED|PARTIAL  -> resume (status=RUNNING), worker retoma do checkpoint
 *      RUNNING|PENDING -> 409 (ja em processamento)
 *      COMPLETED|CANCELLED -> 409 (estado nao reprocessavel; sem falso sucesso)
 *  - toda acao grava AuditService.log (aceite B7: "com feedback e audit log").
 */

import { prisma } from '@/lib/prisma'
import { CollectionJobStatus } from '@/lib/constants/enums'
import { tasks } from '@trigger.dev/sdk/v3'
import type { DataSource, Prisma } from '@prisma/client'
import { buildErrorList, type CollectionErrorItem, type CollectionErrorStatus } from './_errors-mapper'
import { dispatchCollectLeads } from '@/lib/workers/collect-dispatch'

export interface OwnedJob {
  id: string
  userId: string
  name: string | null
  niche: string
  city: string
  state: string | null
  country: string | null
  sources: DataSource[]
  limitVal: number | null
  status: string
  errorLog: unknown
  errorMessage: string | null
}

export async function getOwnedJob(userId: string, jobId: string): Promise<OwnedJob | null> {
  return (await prisma.collectionJob.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      userId: true,
      name: true,
      niche: true,
      city: true,
      state: true,
      country: true,
      sources: true,
      limitVal: true,
      status: true,
      errorLog: true,
      errorMessage: true,
    },
  })) as OwnedJob | null
}

/**
 * Persiste a lista canonica de erros de volta no errorLog do job.
 * O shape gravado ({id, code, message, rootCause, checkpoint, at, retryable,
 * status}) e re-lido por buildErrorList sem perda (round-trip estavel) e
 * normaliza de vez o historico heterogeneo legado.
 */
export async function persistErrorList(jobId: string, items: CollectionErrorItem[]): Promise<void> {
  const records = items.map((item) => ({
    id: item.errorId,
    code: item.code,
    message: item.message,
    rootCause: item.rootCause,
    checkpoint: item.checkpoint,
    at: item.timestamp,
    retryable: item.retryable,
    status: item.status,
  }))
  await prisma.collectionJob.update({
    where: { id: jobId },
    data: { errorLog: records as Prisma.InputJsonValue },
  })
}

export function loadErrors(job: OwnedJob): CollectionErrorItem[] {
  return buildErrorList(job.id, job.errorLog, job.errorMessage)
}

export function markStatus(
  items: CollectionErrorItem[],
  errorIds: Set<string>,
  status: CollectionErrorStatus,
): CollectionErrorItem[] {
  return items.map((item) => (errorIds.has(item.errorId) ? { ...item, status } : item))
}

export type RequeueOutcome =
  | { mode: 'child'; childJobId: string }
  | { mode: 'resumed' }
  | { mode: 'blocked'; reason: 'in_progress' | 'terminal'; status: string }

/**
 * Dispara o reprocessamento real do job conforme o estado atual.
 * Nunca devolve sucesso sem efeito: estados nao reprocessaveis viram 'blocked'
 * para o handler responder 409 honesto.
 */
export async function requeueJob(job: OwnedJob): Promise<RequeueOutcome> {
  if (job.status === CollectionJobStatus.RUNNING || job.status === CollectionJobStatus.PENDING) {
    return { mode: 'blocked', reason: 'in_progress', status: job.status }
  }

  if (job.status === CollectionJobStatus.PAUSED || job.status === CollectionJobStatus.PARTIAL) {
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { status: CollectionJobStatus.RUNNING, errorMessage: null },
    })
    return { mode: 'resumed' }
  }

  if (job.status === CollectionJobStatus.FAILED) {
    // Mesmo fluxo de POST /api/v1/jobs/[id]/retry: child job herda leads do
    // parent via retriedFromId (checkpointing real no worker collect-leads).
    const retry = await prisma.collectionJob.create({
      data: {
        userId: job.userId,
        name: job.name ?? undefined,
        niche: job.niche,
        city: job.city,
        state: job.state ?? undefined,
        country: job.country ?? undefined,
        sources: job.sources,
        limitVal: job.limitVal,
        status: CollectionJobStatus.PENDING,
        retriedFromId: job.id,
      },
      select: { id: true },
    })
    try {
      await dispatchCollectLeads( {
        jobId: retry.id,
        query: job.niche,
        location: job.state ? `${job.city}, ${job.state}` : job.city,
        maxResults: job.limitVal ?? 100,
        retriedFromId: job.id,
      })
    } catch (err) {
      // Sem Trigger.dev configurado o child fica PENDING e o dispatcher local
      // assume; nao e falha da acao de retry.
      console.error('[collection.errors.retry] trigger.dev falhou, child fica PENDING:', err)
    }
    return { mode: 'child', childJobId: retry.id }
  }

  // COMPLETED | CANCELLED: relancar a coleta inteira por causa de um item de
  // erro historico seria efeito colateral desproporcional - exigir intencao
  // explicita via retry da coleta.
  return { mode: 'blocked', reason: 'terminal', status: job.status }
}
