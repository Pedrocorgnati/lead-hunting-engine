import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { tasks } from '@trigger.dev/sdk/v3'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { CollectionJobStatus } from '@/lib/constants/enums'

const BulkActionSchema = z.object({
  jobIds: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().trim().min(5).max(500),
  correlationId: z.string().trim().min(1).max(120).optional(),
  confirmationChallenge: z.string().trim().max(120).optional(),
})

type BulkActionInput = z.infer<typeof BulkActionSchema>
type AdminJobAction = 'bulk-retry' | 'bulk-cancel' | 'pause' | 'resume'
type JobActionResult = {
  jobId: string
  ok: boolean
  action: AdminJobAction
  status?: string
  newJobId?: string
  error?: {
    code: string
    message: string
  }
}

const CONFIRMATION_CHALLENGES: Record<'bulk-retry' | 'bulk-cancel', string> = {
  'bulk-retry': 'REEXECUTAR JOBS',
  'bulk-cancel': 'CANCELAR JOBS',
}

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
const PAUSABLE_STATUSES: CollectionJobStatus[] = [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING]
const RESUMABLE_STATUSES: CollectionJobStatus[] = [CollectionJobStatus.PAUSED]

function getIp(request: NextRequest): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined
}

function invalidChallenge(action: 'bulk-retry' | 'bulk-cancel', value: string | undefined) {
  const expected = CONFIRMATION_CHALLENGES[action]
  if (value === expected) return null
  return NextResponse.json(
    {
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: `confirmationChallenge deve ser "${expected}".`,
      },
    },
    { status: 400 },
  )
}

function buildSummary(results: JobActionResult[]) {
  const succeeded = results.filter((result) => result.ok).length
  const errors = results
    .filter((result) => !result.ok)
    .map((result) => ({
      jobId: result.jobId,
      code: result.error?.code ?? 'UNKNOWN_ERROR',
      message: result.error?.message ?? 'Falha desconhecida.',
    }))

  return {
    requested: results.length,
    succeeded,
    failed: results.length - succeeded,
    affected: succeeded,
    errors,
  }
}

function fail(jobId: string, action: AdminJobAction, code: string, message: string): JobActionResult {
  return { jobId, action, ok: false, error: { code, message } }
}

async function readInput(request: NextRequest): Promise<BulkActionInput> {
  return BulkActionSchema.parse(await request.json().catch(() => ({})))
}

async function getJobs(jobIds: string[]) {
  const jobs = await prisma.collectionJob.findMany({
    where: { id: { in: jobIds } },
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
    },
  })
  return new Map(jobs.map((job) => [job.id, job]))
}

async function auditJobAction(input: {
  adminId: string
  action: string
  jobId: string
  reason: string
  correlationId: string
  ipAddress?: string
  userAgent?: string
  extra?: Record<string, string | number | boolean | null>
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.adminId,
      action: input.action,
      resource: 'collection_job',
      resourceId: input.jobId,
      metadata: {
        reason: input.reason,
        correlationId: input.correlationId,
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        ...(input.extra ?? {}),
      },
      ipAddress: input.ipAddress,
    },
  })
}

async function executeBulkRetry(request: NextRequest) {
  const admin = await requireAdmin()
  const input = await readInput(request)
  const challengeError = invalidChallenge('bulk-retry', input.confirmationChallenge)
  if (challengeError) return challengeError

  const correlationId = input.correlationId ?? crypto.randomUUID()
  const jobs = await getJobs(input.jobIds)
  const results: JobActionResult[] = []

  for (const jobId of input.jobIds) {
    const parent = jobs.get(jobId)
    if (!parent) {
      results.push(fail(jobId, 'bulk-retry', 'JOB_NOT_FOUND', 'Job nao encontrado.'))
      continue
    }
    if (!RETRYABLE_STATUSES.includes(parent.status)) {
      results.push(fail(jobId, 'bulk-retry', 'INVALID_STATUS', `Status ${parent.status} nao permite retry.`))
      continue
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
      },
      select: { id: true, status: true },
    })

    await auditJobAction({
      adminId: admin.id,
      action: 'admin.job.bulk_retry',
      jobId: retry.id,
      reason: input.reason,
      correlationId,
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
      extra: { parentId: parent.id },
    })

    try {
      await tasks.trigger('collect-leads', {
        jobId: retry.id,
        query: parent.niche,
        location: parent.state ? `${parent.city}, ${parent.state}` : parent.city,
        maxResults: parent.limitVal ?? 100,
        retriedFromId: parent.id,
        correlationId,
      })
    } catch (error) {
      console.error('[admin.jobs.bulk-retry] trigger.dev falhou, retry fica PENDING:', error)
    }

    results.push({ jobId, action: 'bulk-retry', ok: true, status: retry.status, newJobId: retry.id })
  }

  return successResponse({ correlationId, summary: buildSummary(results), results })
}

async function executeStatusChange(
  request: NextRequest,
  action: Exclude<AdminJobAction, 'bulk-retry'>,
  options: {
    validStatuses: CollectionJobStatus[]
    nextStatus: CollectionJobStatus
    auditAction: string
    completedAt?: Date | null
    clearError?: boolean
  },
) {
  const admin = await requireAdmin()
  const input = await readInput(request)
  if (action === 'bulk-cancel') {
    const challengeError = invalidChallenge('bulk-cancel', input.confirmationChallenge)
    if (challengeError) return challengeError
  }

  const correlationId = input.correlationId ?? crypto.randomUUID()
  const jobs = await getJobs(input.jobIds)
  const results: JobActionResult[] = []

  for (const jobId of input.jobIds) {
    const job = jobs.get(jobId)
    if (!job) {
      results.push(fail(jobId, action, 'JOB_NOT_FOUND', 'Job nao encontrado.'))
      continue
    }
    if (!options.validStatuses.includes(job.status)) {
      results.push(fail(jobId, action, 'INVALID_STATUS', `Status ${job.status} nao permite esta acao.`))
      continue
    }

    const updated = await prisma.collectionJob.update({
      where: { id: job.id },
      data: {
        status: options.nextStatus,
        ...(options.completedAt !== undefined ? { completedAt: options.completedAt } : {}),
        ...(options.clearError ? { errorMessage: null } : {}),
        ...(action === 'bulk-cancel' ? { errorMessage: input.reason } : {}),
      },
      select: { id: true, status: true },
    })

    await auditJobAction({
      adminId: admin.id,
      action: options.auditAction,
      jobId: updated.id,
      reason: input.reason,
      correlationId,
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
      extra: { previousStatus: job.status, nextStatus: updated.status },
    })

    results.push({ jobId, action, ok: true, status: updated.status })
  }

  return successResponse({ correlationId, summary: buildSummary(results), results })
}

export async function bulkRetry(request: NextRequest) {
  try {
    return await executeBulkRetry(request)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function bulkCancel(request: NextRequest) {
  try {
    return await executeStatusChange(request, 'bulk-cancel', {
      validStatuses: CANCELLABLE_STATUSES,
      nextStatus: CollectionJobStatus.CANCELLED,
      auditAction: 'admin.job.bulk_cancel',
      completedAt: new Date(),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function pauseQueue(request: NextRequest) {
  try {
    return await executeStatusChange(request, 'pause', {
      validStatuses: PAUSABLE_STATUSES,
      nextStatus: CollectionJobStatus.PAUSED,
      auditAction: 'admin.job.queue_pause',
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function resumeQueue(request: NextRequest) {
  try {
    return await executeStatusChange(request, 'resume', {
      validStatuses: RESUMABLE_STATUSES,
      nextStatus: CollectionJobStatus.PENDING,
      auditAction: 'admin.job.queue_resume',
      completedAt: null,
      clearError: true,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  const pathname = new URL(request.url).pathname
  if (pathname.endsWith('/bulk-retry')) return bulkRetry(request)
  if (pathname.endsWith('/bulk-cancel')) return bulkCancel(request)
  if (pathname.endsWith('/queue/pause')) return pauseQueue(request)
  if (pathname.endsWith('/queue/resume')) return resumeQueue(request)

  return NextResponse.json(
    {
      error: {
        code: 'INVALID_ACTION',
        message: 'Use /bulk-retry, /bulk-cancel, /queue/pause ou /queue/resume.',
      },
    },
    { status: 404 },
  )
}
