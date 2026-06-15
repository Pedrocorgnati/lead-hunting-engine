import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { errorResponse, JOB_080 } from '@/constants/errors'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { CollectionJobStatus } from '@/lib/constants/enums'
import { prisma } from '@/lib/prisma'
import { JobIdSchema, getRequestCorrelationId } from '../admin-job-detail'
import { dispatchCollectLeads } from '@/lib/workers/collect-dispatch'

const JobActionBodySchema = z.object({
  reason: z.string().trim().min(5).max(500),
  correlationId: z.string().trim().min(1).max(120).optional(),
  escalateTo: z.string().trim().min(2).max(120).optional(),
})

type AdminJobAction = 'retry' | 'cancel' | 'escalate'
type JobActionBody = z.infer<typeof JobActionBodySchema>
type JsonRecord = Record<string, Prisma.JsonValue>

const RETRYABLE_STATUSES: CollectionJobStatus[] = [
  CollectionJobStatus.FAILED,
  CollectionJobStatus.PARTIAL,
  CollectionJobStatus.CANCELLED,
]
const CANCELLABLE_STATUSES: CollectionJobStatus[] = [
  CollectionJobStatus.PENDING,
  CollectionJobStatus.RUNNING,
  CollectionJobStatus.PAUSED,
]
const ESCALATABLE_STATUSES: CollectionJobStatus[] = [
  CollectionJobStatus.PENDING,
  CollectionJobStatus.RUNNING,
  CollectionJobStatus.FAILED,
  CollectionJobStatus.PARTIAL,
  CollectionJobStatus.PAUSED,
]

function getIp(request: NextRequest): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined
}

async function readBody(request: NextRequest): Promise<JobActionBody> {
  return JobActionBodySchema.parse(await request.json().catch(() => ({})))
}

function actionFromRequest(request: NextRequest): AdminJobAction | null {
  const pathname = new URL(request.url).pathname
  if (pathname.endsWith('/retry')) return 'retry'
  if (pathname.endsWith('/cancel')) return 'cancel'
  if (pathname.endsWith('/escalate')) return 'escalate'
  return null
}

function actionLabel(action: AdminJobAction): string {
  return `admin.job.${action}`
}

function asRecord(value: Prisma.JsonValue | null | undefined): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function invalidStatusResponse(input: {
  action: AdminJobAction
  status: CollectionJobStatus
  correlationId: string
}) {
  return NextResponse.json(
    {
      error: {
        code: 'INVALID_STATUS',
        message: `Status ${input.status} nao permite ${input.action}.`,
        correlationId: input.correlationId,
      },
    },
    { status: 409 },
  )
}

type AuditOutcome = { id: string | null; ok: boolean }

// Audit best-effort (Zero Silencio): comando ja mutou estado, entao falha de
// auditoria nunca derruba a resposta. Retorna { ok:false } para o caller anexar
// auditLogWarning (DEGRADED) em vez de propagar 500.
async function auditJobCommand(input: {
  adminId: string
  action: AdminJobAction
  jobId: string
  reason: string
  correlationId: string
  result: 'SUCCESS' | 'INVALID_STATUS'
  previousStatus?: CollectionJobStatus
  nextStatus?: CollectionJobStatus
  newJobId?: string
  escalateTo?: string
  ipAddress?: string
  userAgent?: string
}): Promise<AuditOutcome> {
  try {
    const log = await prisma.auditLog.create({
      data: {
        userId: input.adminId,
        action: actionLabel(input.action),
        resource: 'collection_job',
        resourceId: input.jobId,
        metadata: {
          reason: input.reason,
          result: input.result,
          correlationId: input.correlationId,
          ...(input.previousStatus ? { previousStatus: input.previousStatus } : {}),
          ...(input.nextStatus ? { nextStatus: input.nextStatus } : {}),
          ...(input.newJobId ? { newJobId: input.newJobId } : {}),
          ...(input.escalateTo ? { escalateTo: input.escalateTo } : {}),
          ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        },
        ipAddress: input.ipAddress,
      },
      select: { id: true },
    })
    return { id: log.id, ok: true }
  } catch (error) {
    console.error(`[admin.jobs.${input.action}] audit log falhou (${input.result}):`, error)
    return { id: null, ok: false }
  }
}

const AUDIT_PENDING_MESSAGE = 'Comando executado; registro de auditoria pendente'

// Anexa auditLogId/executedAt ao envelope de sucesso e, em DEGRADED (audit
// falhou apos a mutacao), marca auditLogWarning sem derrubar o comando.
function withAuditMeta<T extends Record<string, unknown>>(payload: T, audit: AuditOutcome) {
  return {
    ...payload,
    auditLogId: audit.id,
    executedAt: new Date().toISOString(),
    ...(audit.ok ? {} : { auditLogWarning: true, message: AUDIT_PENDING_MESSAGE }),
  }
}

async function executeRetry(
  request: NextRequest,
  adminId: string,
  id: string,
  body: JobActionBody,
  correlationId: string,
) {
  const parent = await prisma.collectionJob.findUnique({
    where: { id },
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
      metadata: true,
    },
  })

  if (!parent) return NextResponse.json(errorResponse(JOB_080), { status: 404 })
  if (!RETRYABLE_STATUSES.includes(parent.status)) {
    await auditJobCommand({
      adminId,
      action: 'retry',
      jobId: parent.id,
      reason: body.reason,
      correlationId,
      result: 'INVALID_STATUS',
      previousStatus: parent.status,
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    })
    return invalidStatusResponse({ action: 'retry', status: parent.status, correlationId })
  }

  const retry = await prisma.collectionJob.create({
    data: {
      userId: parent.userId,
      name: parent.name,
      niche: parent.niche,
      city: parent.city,
      state: parent.state,
      country: parent.country,
      sources: parent.sources,
      limitVal: parent.limitVal,
      status: CollectionJobStatus.PENDING,
      retriedFromId: parent.id,
      metadata: {
        ...asRecord(parent.metadata),
        correlationId,
        retryReason: body.reason,
        retriedFromId: parent.id,
      },
    },
    select: { id: true, status: true },
  })

  const audit = await auditJobCommand({
    adminId,
    action: 'retry',
    jobId: parent.id,
    reason: body.reason,
    correlationId,
    result: 'SUCCESS',
    previousStatus: parent.status,
    nextStatus: retry.status,
    newJobId: retry.id,
    ipAddress: getIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
  })

  try {
    await dispatchCollectLeads( {
      jobId: retry.id,
      query: parent.niche,
      location: parent.state ? `${parent.city}, ${parent.state}` : parent.city,
      maxResults: parent.limitVal ?? 100,
      sources: parent.sources,
      retriedFromId: parent.id,
      correlationId,
    })
  } catch (error) {
    console.error('[admin.jobs.retry] trigger.dev falhou, retry fica PENDING:', error)
  }

  return successResponse(
    withAuditMeta(
      {
        id: parent.id,
        action: 'retry',
        jobId: parent.id,
        newJobId: retry.id,
        status: retry.status,
        correlationId,
        result: 'SUCCESS',
      },
      audit,
    ),
  )
}

async function executeCancel(
  request: NextRequest,
  adminId: string,
  id: string,
  body: JobActionBody,
  correlationId: string,
) {
  const job = await prisma.collectionJob.findUnique({
    where: { id },
    select: { id: true, status: true },
  })

  if (!job) return NextResponse.json(errorResponse(JOB_080), { status: 404 })
  if (!CANCELLABLE_STATUSES.includes(job.status)) {
    await auditJobCommand({
      adminId,
      action: 'cancel',
      jobId: job.id,
      reason: body.reason,
      correlationId,
      result: 'INVALID_STATUS',
      previousStatus: job.status,
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    })
    return invalidStatusResponse({ action: 'cancel', status: job.status, correlationId })
  }

  const updated = await prisma.collectionJob.update({
    where: { id: job.id },
    data: {
      status: CollectionJobStatus.CANCELLED,
      errorMessage: body.reason,
      completedAt: new Date(),
    },
    select: { id: true, status: true },
  })

  const audit = await auditJobCommand({
    adminId,
    action: 'cancel',
    jobId: updated.id,
    reason: body.reason,
    correlationId,
    result: 'SUCCESS',
    previousStatus: job.status,
    nextStatus: updated.status,
    ipAddress: getIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
  })

  return successResponse(
    withAuditMeta(
      {
        id: updated.id,
        action: 'cancel',
        jobId: updated.id,
        status: updated.status,
        correlationId,
        result: 'SUCCESS',
      },
      audit,
    ),
  )
}

async function executeEscalate(
  request: NextRequest,
  adminId: string,
  id: string,
  body: JobActionBody,
  correlationId: string,
) {
  const job = await prisma.collectionJob.findUnique({
    where: { id },
    select: { id: true, status: true, metadata: true },
  })

  if (!job) return NextResponse.json(errorResponse(JOB_080), { status: 404 })
  if (!ESCALATABLE_STATUSES.includes(job.status)) {
    await auditJobCommand({
      adminId,
      action: 'escalate',
      jobId: job.id,
      reason: body.reason,
      correlationId,
      result: 'INVALID_STATUS',
      previousStatus: job.status,
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    })
    return invalidStatusResponse({ action: 'escalate', status: job.status, correlationId })
  }

  const escalation = {
    reason: body.reason,
    escalateTo: body.escalateTo ?? 'operations',
    correlationId,
    escalatedAt: new Date().toISOString(),
    escalatedBy: adminId,
  }
  const updated = await prisma.collectionJob.update({
    where: { id: job.id },
    data: {
      metadata: {
        ...asRecord(job.metadata),
        correlationId,
        escalation,
      },
    },
    select: { id: true, status: true },
  })

  const audit = await auditJobCommand({
    adminId,
    action: 'escalate',
    jobId: updated.id,
    reason: body.reason,
    correlationId,
    result: 'SUCCESS',
    previousStatus: job.status,
    nextStatus: updated.status,
    escalateTo: escalation.escalateTo,
    ipAddress: getIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
  })

  return successResponse(
    withAuditMeta(
      {
        id: updated.id,
        action: 'escalate',
        jobId: updated.id,
        status: updated.status,
        correlationId,
        result: 'SUCCESS',
        escalation,
      },
      audit,
    ),
  )
}

export async function executeJobAction(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  actionOverride?: AdminJobAction,
) {
  try {
    const admin = await requireAdmin()
    const { id: rawId } = await params
    const id = JobIdSchema.parse(rawId)
    const action = actionOverride ?? actionFromRequest(request)
    if (!action) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_ACTION',
            message: 'Use /retry, /cancel ou /escalate.',
          },
        },
        { status: 404 },
      )
    }

    const body = await readBody(request)
    const correlationId = body.correlationId ?? getRequestCorrelationId(request)

    if (action === 'retry') return executeRetry(request, admin.id, id, body, correlationId)
    if (action === 'cancel') return executeCancel(request, admin.id, id, body, correlationId)
    return executeEscalate(request, admin.id, id, body, correlationId)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function retryJob(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return executeJobAction(request, ctx, 'retry')
}

export async function cancelJob(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return executeJobAction(request, ctx, 'cancel')
}

export async function escalateJob(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return executeJobAction(request, ctx, 'escalate')
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return executeJobAction(request, ctx)
}
