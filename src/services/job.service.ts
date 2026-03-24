import { prisma } from '@/lib/prisma'
import { CollectionJobStatus } from '@/lib/constants/enums'
import { AuthError } from '@/lib/auth'
import { tasks } from '@trigger.dev/sdk/v3'
import { JOB_052 } from '@/constants/errors'
import type { CreateJobInput } from '@/schemas/job.schema'
import type { CollectionJob } from '@prisma/client'

export class JobService {
  async findAllByUser(userId: string): Promise<CollectionJob[]> {
    return prisma.collectionJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  }

  async create(data: CreateJobInput, userId: string): Promise<CollectionJob> {
    const job = await prisma.collectionJob.create({
      data: {
        userId,
        name: data.niche,
        niche: data.niche,
        city: data.city,
        state: data.state ?? null,
        country: 'BR',
        sources: data.sources,
        limitVal: data.limit ?? 100,
        status: CollectionJobStatus.PENDING,
      },
    })

    // Disparar trigger.dev assincronamente (não bloqueia response)
    await tasks.trigger('collect-leads', {
      jobId: job.id,
      query: job.niche,
      location: job.state ? `${job.city}, ${job.state}` : job.city,
      maxResults: job.limitVal ?? 100,
    })

    return job
  }

  async getStatus(jobId: string, userId: string) {
    const job = await prisma.collectionJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        progress: true,
        resultCount: true,
        errorMessage: true,
        userId: true,
      },
    })

    // IDOR: retorna null (→ 404) sem vazar existência do job
    if (!job || job.userId !== userId) return null

    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      resultCount: job.resultCount,
      errorMessage: job.errorMessage,
    }
  }

  async cancel(jobId: string, userId: string): Promise<void> {
    const job = await prisma.collectionJob.findUnique({
      where: { id: jobId },
      select: { status: true, userId: true },
    })

    if (!job || job.userId !== userId) {
      throw new AuthError('FORBIDDEN')
    }

    const cancellable: CollectionJobStatus[] = [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING]
    if (!cancellable.includes(job.status)) {
      const err = Object.assign(
        new Error(JOB_052.userMessage),
        { code: JOB_052.code, httpStatus: JOB_052.httpStatus }
      )
      throw err
    }

    await prisma.collectionJob.update({
      where: { id: jobId },
      data: {
        status: CollectionJobStatus.CANCELLED,
        errorMessage: 'Cancelado pelo usuário.',
        completedAt: new Date(),
      },
    })
  }

  async countConcurrent(userId: string): Promise<number> {
    return prisma.collectionJob.count({
      where: {
        userId,
        status: { in: [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING] },
      },
    })
  }

  async findById(jobId: string, userId: string) {
    const job = await prisma.collectionJob.findUnique({
      where: { id: jobId },
      include: {
        rawLeadData: {
          take: 20,
          select: {
            id: true,
            businessName: true,
            address: true,
            phone: true,
            website: true,
            rating: true,
            source: true,
          },
        },
      },
    })

    // IDOR: retorna null (→ 404) sem vazar existência do job
    if (!job || job.userId !== userId) return null

    return job
  }
}

export const jobService = new JobService()
