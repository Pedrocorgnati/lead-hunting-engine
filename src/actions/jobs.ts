'use server'

import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { CollectionJobStatus } from '@/lib/constants/enums'
import { quotaEnforcer } from '@/lib/services/quota-enforcer'
import type { CollectionJobSummary } from '@/lib/types/entities'
import { dispatchCollectLeads } from '@/lib/workers/collect-dispatch'

// Helper: mapeia CollectionJob do DB para CollectionJobSummary da UI
function toSummary(job: {
  id: string
  name: string | null
  niche: string
  city: string
  state: string | null
  status: CollectionJobStatus
  progress: number
  resultCount: number
  limitVal: number | null
  createdAt: Date
  updatedAt?: Date
  errorMessage: string | null
}): CollectionJobSummary {
  return {
    id: job.id,
    name: job.name ?? job.niche,
    query: job.niche,
    location: job.state ? `${job.city}, ${job.state}` : job.city,
    status: job.status,
    progress: job.progress,
    resultCount: job.resultCount,
    maxResults: job.limitVal ?? 100,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt?.toISOString(),
    errorMessage: job.errorMessage ?? undefined,
  }
}

export async function getJobs(): Promise<CollectionJobSummary[]> {
  const user = await requireAuth()

  const jobs = await prisma.collectionJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      niche: true,
      city: true,
      state: true,
      status: true,
      progress: true,
      resultCount: true,
      limitVal: true,
      createdAt: true,
      errorMessage: true,
    },
  })

  return jobs.map(toSummary)
}

export async function createJob(data: {
  name: string
  query: string
  location: string
  radiusMeters: number
  maxResults: number
}): Promise<{ id: string }> {
  const user = await requireAuth()

  // Enforcement de quota pre-dispatch (INTAKE-REVIEW TASK-3 / CL-228).
  // Lanca QuotaExceededError com code+httpStatus para ser convertido em 429 pela UI.
  await quotaEnforcer.assertCanCreateJob(user.id)

  // Extrair cidade e estado de "São Paulo, SP" → { city: "São Paulo", state: "SP" }
  const parts = data.location.split(',').map(p => p.trim())
  const city = parts[0] ?? data.location
  const state = parts[1] ?? null

  const job = await prisma.collectionJob.create({
    data: {
      userId: user.id,
      name: data.name,
      niche: data.query,
      city,
      state,
      country: 'BR',
      sources: ['GOOGLE_MAPS'],
      limitVal: data.maxResults,
      status: CollectionJobStatus.PENDING,
    },
  })

  // Disparar trigger.dev assincronamente
  await dispatchCollectLeads( {
    jobId: job.id,
    query: data.query,
    location: data.location,
    radius: data.radiusMeters,
    maxResults: data.maxResults,
  })

  return { id: job.id }
}

export async function getJobStatus(id: string): Promise<{
  status: CollectionJobStatus
  progress: number
  resultCount: number
  errorMessage?: string
  updatedAt?: string
} | null> {
  const user = await requireAuth()

  const job = await prisma.collectionJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      progress: true,
      resultCount: true,
      errorMessage: true,
      updatedAt: true,
      userId: true,
    },
  })

  // IDOR: retorna null sem vazar existência do job
  if (!job || job.userId !== user.id) return null

  return {
    status: job.status,
    progress: job.progress,
    resultCount: job.resultCount,
    errorMessage: job.errorMessage ?? undefined,
    updatedAt: job.updatedAt.toISOString(),
  }
}

export async function getJob(id: string): Promise<CollectionJobSummary | null> {
  const user = await requireAuth()

  const job = await prisma.collectionJob.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      niche: true,
      city: true,
      state: true,
      status: true,
      progress: true,
      resultCount: true,
      limitVal: true,
      createdAt: true,
      updatedAt: true,
      errorMessage: true,
      userId: true,
      sources: true,
      startedAt: true,
      completedAt: true,
      triggerId: true,
      errorLog: true,
    },
  })

  if (!job || job.userId !== user.id) return null

  return {
    ...toSummary(job),
    sources: job.sources,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    triggerId: job.triggerId ?? null,
    errorLog: job.errorLog ?? null,
  } as CollectionJobSummary & {
    sources: string[]
    startedAt: string | null
    completedAt: string | null
    triggerId: string | null
    errorLog: unknown
  }
}

export async function getJobLeads(jobId: string): Promise<{ id: string; name: string; category: string | null; city: string | null; score: number; status: string }[]> {
  const user = await requireAuth()

  const job = await prisma.collectionJob.findUnique({
    where: { id: jobId },
    select: { userId: true },
  })

  if (!job || job.userId !== user.id) return []

  const leads = await prisma.lead.findMany({
    where: { jobId },
    select: {
      id: true,
      businessName: true,
      category: true,
      city: true,
      score: true,
      status: true,
    },
    orderBy: { score: 'desc' },
    take: 200,
  })

  // Mapeia businessName -> name para contrato estavel do caller
  return leads.map((l) => ({
    id: l.id,
    name: l.businessName,
    category: l.category,
    city: l.city,
    score: l.score,
    status: l.status,
  }))
}

export async function cancelJob(id: string): Promise<{ success: boolean }> {
  const user = await requireAuth()

  const job = await prisma.collectionJob.findUnique({
    where: { id },
    select: { status: true, userId: true },
  })

  if (!job || job.userId !== user.id) {
    throw new Error('Coleta não encontrada.')
  }

  const cancellable: CollectionJobStatus[] = [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING]
  if (!cancellable.includes(job.status)) {
    throw new Error('Apenas coletas pendentes ou em andamento podem ser canceladas.')
  }

  await prisma.collectionJob.update({
    where: { id },
    data: {
      status: CollectionJobStatus.CANCELLED,
      errorMessage: 'Cancelado pelo usuário.',
      completedAt: new Date(),
    },
  })

  return { success: true }
}

export async function resumeJob(id: string): Promise<{ success: boolean }> {
  const user = await requireAuth()

  const job = await prisma.collectionJob.findUnique({
    where: { id },
    select: { status: true, userId: true },
  })

  if (!job || job.userId !== user.id) {
    throw new Error('Coleta não encontrada.')
  }

  if (job.status !== CollectionJobStatus.PAUSED && job.status !== CollectionJobStatus.PARTIAL) {
    throw new Error('Apenas coletas pausadas ou parciais podem ser retomadas.')
  }

  await prisma.collectionJob.update({
    where: { id },
    data: { status: CollectionJobStatus.RUNNING, errorMessage: null },
  })

  return { success: true }
}

export async function exportPartialJob(id: string): Promise<{ downloadUrl: string }> {
  const user = await requireAuth()

  const job = await prisma.collectionJob.findUnique({
    where: { id },
    select: { userId: true },
  })

  if (!job || job.userId !== user.id) {
    throw new Error('Coleta não encontrada.')
  }

  // Endpoint delegates actual CSV generation to the API route
  return { downloadUrl: `/api/v1/jobs/${id}/export-partial` }
}

export interface CollectionLogEntry {
  id: string
  action: string
  metadata: unknown
  ipAddress: string | null
  createdAt: string
}

export async function getJobLogs(id: string): Promise<CollectionLogEntry[]> {
  const user = await requireAuth()

  const job = await prisma.collectionJob.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  })

  if (!job) return []

  const logs = await prisma.auditLog.findMany({
    where: { resource: 'collection_job', resourceId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, action: true, metadata: true, ipAddress: true, createdAt: true },
  })

  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    metadata: l.metadata,
    ipAddress: l.ipAddress,
    createdAt: l.createdAt.toISOString(),
  }))
}
