import type { Prisma } from '@prisma/client'

export const QUEUE_STATUSES = ['PENDING', 'LEASED', 'DONE', 'FAILED'] as const

export type QueueStatus = (typeof QUEUE_STATUSES)[number]

export interface AdminQueueFilters {
  status?: QueueStatus
  kind?: string
  priority?: string
  correlationId?: string
}

export interface QueueJobPayloadSummary {
  priority: string | null
  correlationId: string | null
  collectionJobId: string | null
}

export interface QueueJobView extends QueueJobPayloadSummary {
  id: string
  kind: string
  status: string
  attempts: number
  runAt: string
  createdAt: string
  leasedUntil: string | null
  lastError: string | null
  lastUpdatedAt: string
}

export function buildAdminQueueWhere(filters: AdminQueueFilters): Prisma.LocalQueueJobWhereInput {
  const and: Prisma.LocalQueueJobWhereInput[] = []

  if (filters.status) and.push({ status: filters.status })
  if (filters.kind) and.push({ kind: filters.kind })
  if (filters.priority) {
    and.push({ payload: { path: ['priority'], equals: filters.priority } })
  }
  if (filters.correlationId) {
    and.push({ payload: { path: ['correlationId'], equals: filters.correlationId } })
  }

  return and.length ? { AND: and } : {}
}

export function summarizeQueuePayload(payload: Prisma.JsonValue): QueueJobPayloadSummary {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { priority: null, correlationId: null, collectionJobId: null }
  }

  const data = payload as Record<string, Prisma.JsonValue>
  return {
    priority: stringValue(data.priority),
    correlationId: stringValue(data.correlationId),
    collectionJobId: stringValue(data.jobId) ?? stringValue(data.collectionJobId) ?? stringValue(data.id),
  }
}

export function toQueueJobView(job: {
  id: string
  kind: string
  payload: Prisma.JsonValue
  status: string
  attempts: number
  leasedUntil: Date | null
  lastError: string | null
  createdAt: Date
  runAt: Date
}): QueueJobView {
  const payload = summarizeQueuePayload(job.payload)
  const lastUpdatedAt = job.leasedUntil ?? job.runAt ?? job.createdAt

  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    priority: payload.priority,
    correlationId: payload.correlationId,
    collectionJobId: payload.collectionJobId,
    runAt: job.runAt.toISOString(),
    createdAt: job.createdAt.toISOString(),
    leasedUntil: job.leasedUntil?.toISOString() ?? null,
    lastError: job.lastError,
    lastUpdatedAt: lastUpdatedAt.toISOString(),
  }
}

function stringValue(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
