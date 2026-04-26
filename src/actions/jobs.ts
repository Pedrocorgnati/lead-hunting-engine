'use server'

import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { CollectionJobStatus } from '@/lib/constants/enums'
import { tasks } from '@trigger.dev/sdk/v3'
import { quotaEnforcer } from '@/lib/services/quota-enforcer'
import type { CollectionJobSummary } from '@/lib/types/entities'

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
  await tasks.trigger('collect-leads', {
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
      errorMessage: true,
      userId: true,
      sources: true,
      startedAt: true,
      completedAt: true,
    },
  })

  if (!job || job.userId !== user.id) return null

  return {
    ...toSummary(job),
    sources: job.sources,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  } as CollectionJobSummary & { sources: string[]; startedAt: string | null; completedAt: string | null }
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
