import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { errorResponse, JOB_080 } from '@/constants/errors'
import { prisma } from '@/lib/prisma'

export const JobIdSchema = z.string().trim().min(1).max(120)
export const LogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

const REDACTED = '[REDACTED]'
const SECRET_KEY_PATTERN = /(authorization|cookie|secret|token|api[-_]?key|apikey|password|credential|bearer)/i
const EMAIL_PATTERN = /\b([\w._%+À-ɏ-])([\w._%+À-ɏ-]*?)@([\w.À-ɏ-]+\.[A-Z]{2,})\b/gi
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g
const DOCUMENT_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g

type JsonRecord = Record<string, unknown>

type AdminJob = {
  id: string
  name: string | null
  status: string
  sources: string[]
  processedLeads: number
  resultCount: number
  progress: number
  triggerId: string | null
  errorMessage: string | null
  currentSource: string | null
  errorLog: Prisma.JsonValue | null
  startedAt: Date | null
  completedAt: Date | null
  retriedFromId: string | null
  metadata: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}

type AdminAuditLog = {
  id: string
  action: string
  resource: string
  resourceId: string | null
  metadata: Prisma.JsonValue | null
  ipAddress: string | null
  createdAt: Date
}

export async function readAdminJob(id: string): Promise<AdminJob | null> {
  return prisma.collectionJob.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      sources: true,
      processedLeads: true,
      resultCount: true,
      progress: true,
      triggerId: true,
      errorMessage: true,
      currentSource: true,
      errorLog: true,
      startedAt: true,
      completedAt: true,
      retriedFromId: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export function notFoundResponse() {
  return NextResponse.json(errorResponse(JOB_080), { status: 404 })
}

export function getRequestCorrelationId(request: NextRequest): string {
  return request.headers.get('x-correlation-id')?.trim() || crypto.randomUUID()
}

export function getJobCorrelationId(job: AdminJob, fallback: string): string {
  return stringFromJson(job.metadata, 'correlationId') ?? stringFromJson(job.errorLog, 'correlationId') ?? fallback
}

export function serializeJobDetail(job: AdminJob, correlationId: string) {
  const provider = job.currentSource ?? stringFromJson(job.metadata, 'provider') ?? stringFromJson(job.metadata, 'source')
  const alertId = stringFromJson(job.metadata, 'alertId')

  return {
    id: job.id,
    type: job.name ?? stringFromJson(job.metadata, 'type') ?? 'collection',
    status: job.status,
    priority: stringFromJson(job.metadata, 'priority'),
    provider,
    collectionId: stringFromJson(job.metadata, 'collectionId') ?? job.id,
    alertId,
    correlationId,
    rootCause: rootCause(job),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.completedAt?.toISOString() ?? null,
    lastUpdatedAt: job.updatedAt.toISOString(),
    timeline: buildTimeline(job, correlationId),
  }
}

export function serializeJobAttempts(job: AdminJob, correlationId: string) {
  const attempts = extractAttemptRecords(job, correlationId)

  return {
    jobId: job.id,
    attempts,
    total: attempts.length,
    lastUpdatedAt: job.updatedAt.toISOString(),
    correlationId,
  }
}

export async function serializeJobLogs(job: AdminJob, correlationId: string, limit: number) {
  const auditLogs = await prisma.auditLog.findMany({
    where: { resource: 'collection_job', resourceId: job.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      action: true,
      resource: true,
      resourceId: true,
      metadata: true,
      ipAddress: true,
      createdAt: true,
    },
  })

  const logs = [
    ...auditLogs.map((log) => auditLogToEntry(log, correlationId)),
    ...errorLogToEntries(job, correlationId),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit)
    .map((entry) => maskPii(entry) as ReturnType<typeof auditLogToEntry>)

  return {
    jobId: job.id,
    logs,
    total: logs.length,
    lastUpdatedAt: job.updatedAt.toISOString(),
    correlationId,
    piiMasked: true,
  }
}

function buildTimeline(job: AdminJob, correlationId: string) {
  const rows = [
    {
      at: job.createdAt,
      type: 'created',
      status: 'PENDING',
      message: 'Job criado.',
    },
    job.startedAt
      ? {
          at: job.startedAt,
          type: 'started',
          status: 'RUNNING',
          message: `Execucao iniciada${job.currentSource ? ` em ${job.currentSource}` : ''}.`,
        }
      : null,
    job.errorMessage
      ? {
          at: job.updatedAt,
          type: 'error',
          status: job.status,
          message: maskText(job.errorMessage),
        }
      : null,
    job.completedAt
      ? {
          at: job.completedAt,
          type: 'finished',
          status: job.status,
          message: `Job finalizado com status ${job.status}.`,
        }
      : null,
    job.updatedAt.getTime() !== job.createdAt.getTime()
      ? {
          at: job.updatedAt,
          type: 'updated',
          status: job.status,
          message: `Progresso ${job.progress}% com ${job.processedLeads} processados e ${job.resultCount} resultados.`,
        }
      : null,
  ].filter((row): row is { at: Date; type: string; status: string; message: string } => Boolean(row))

  return rows
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((row) => ({
      at: row.at.toISOString(),
      type: row.type,
      status: row.status,
      message: row.message,
      correlationId,
    }))
}

function extractAttemptRecords(job: AdminJob, correlationId: string) {
  const records = attemptObjects(job.errorLog)
  if (records.length === 0) return []
  return records.map((record, index) => attemptFromRecord(job, record, index + 1, correlationId))
}

function attemptFromRecord(job: AdminJob, record: JsonRecord, attemptNumber: number, fallbackCorrelationId: string) {
  const startedAt = dateFromValue(record.startedAt) ?? job.startedAt
  const finishedAt = dateFromValue(record.finishedAt) ?? dateFromValue(record.completedAt) ?? null
  const message = stringFromRecord(record, 'errorMessage') ?? stringFromRecord(record, 'error') ?? job.errorMessage

  return {
    id: stringFromRecord(record, 'id') ?? `${job.id}:attempt:${attemptNumber}`,
    attemptNumber: numberFromRecord(record, 'attemptNumber') ?? numberFromRecord(record, 'attempt') ?? attemptNumber,
    status: stringFromRecord(record, 'status') ?? job.status,
    provider: stringFromRecord(record, 'provider') ?? job.currentSource ?? stringFromJson(job.metadata, 'provider'),
    startedAt: startedAt?.toISOString() ?? null,
    finishedAt: finishedAt?.toISOString() ?? null,
    durationMs: numberFromRecord(record, 'durationMs') ?? durationMs(startedAt, finishedAt),
    errorCode: stringFromRecord(record, 'errorCode') ?? stringFromRecord(record, 'code'),
    errorMessage: message ? maskText(message) : null,
    correlationId: stringFromRecord(record, 'correlationId') ?? fallbackCorrelationId,
  }
}

function auditLogToEntry(log: AdminAuditLog, fallbackCorrelationId: string) {
  const metadata = maskPii(log.metadata ?? {}) as Prisma.JsonValue
  return {
    at: log.createdAt.toISOString(),
    level: 'info',
    message: log.action,
    provider: stringFromJson(log.metadata, 'provider'),
    collectionId: log.resourceId,
    alertId: stringFromJson(log.metadata, 'alertId'),
    correlationId: stringFromJson(log.metadata, 'correlationId') ?? fallbackCorrelationId,
    metadata: {
      id: log.id,
      resource: log.resource,
      ipAddress: log.ipAddress,
      value: metadata,
    },
  }
}

function errorLogToEntries(job: AdminJob, fallbackCorrelationId: string) {
  const records = Array.isArray(job.errorLog) ? job.errorLog : job.errorLog ? [job.errorLog] : []

  return records.map((record, index) => {
    const object = asRecord(record) ?? {}
    return {
      at: (dateFromValue(object.at) ?? dateFromValue(object.createdAt) ?? job.updatedAt).toISOString(),
      level: stringFromRecord(object, 'level') ?? (job.errorMessage ? 'error' : 'info'),
      message: maskText(stringFromRecord(object, 'message') ?? stringFromRecord(object, 'error') ?? job.errorMessage ?? 'Evento do job.'),
      provider: stringFromRecord(object, 'provider') ?? job.currentSource,
      collectionId: stringFromRecord(object, 'collectionId') ?? job.id,
      alertId: stringFromRecord(object, 'alertId') ?? stringFromJson(job.metadata, 'alertId'),
      correlationId: stringFromRecord(object, 'correlationId') ?? fallbackCorrelationId,
      metadata: maskPii({ index, value: object }) as JsonRecord,
    }
  })
}

function attemptObjects(value: Prisma.JsonValue | null): JsonRecord[] {
  const root = asRecord(value)
  const attempts = root?.attempts
  if (Array.isArray(attempts)) return attempts.flatMap((item) => (asRecord(item) ? [asRecord(item) as JsonRecord] : []))
  if (Array.isArray(value)) return value.flatMap((item) => (asRecord(item) ? [asRecord(item) as JsonRecord] : []))
  return []
}

function rootCause(job: AdminJob): string | null {
  return (
    stringFromJson(job.metadata, 'rootCause') ??
    stringFromJson(job.errorLog, 'rootCause') ??
    (job.errorMessage ? maskText(job.errorMessage) : null)
  )
}

function maskPii(value: unknown): unknown {
  if (typeof value === 'string') return maskText(value)
  if (Array.isArray(value)) return value.map(maskPii)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? REDACTED : maskPii(item),
    ]),
  )
}

function maskText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, (_match, first: string, rest: string, domain: string) => `${first}${rest ? '***' : '*'}@${domain}`)
    .replace(DOCUMENT_PATTERN, (match) => `***${digitsOnly(match).slice(-2)}`)
    .replace(PHONE_PATTERN, (match) => {
      const digits = digitsOnly(match)
      if (digits.length < 8) return match
      return `***${digits.slice(-2)}`
    })
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
}

function stringFromJson(value: Prisma.JsonValue | null, key: string): string | null {
  const record = asRecord(value)
  return record ? stringFromRecord(record, key) : null
}

function numberFromJson(value: Prisma.JsonValue | null, key: string): number | null {
  const record = asRecord(value)
  return record ? numberFromRecord(record, key) : null
}

function stringFromRecord(record: JsonRecord, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function numberFromRecord(record: JsonRecord, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function dateFromValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function durationMs(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null
  return Math.max(0, end.getTime() - start.getTime())
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}
