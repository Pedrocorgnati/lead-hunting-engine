import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import { CollectionJobStatus } from '@/lib/constants/enums'
import { errorResponse, JOB_080, JOB_051, JOB_052 } from '@/constants/errors'
import { tasks } from '@trigger.dev/sdk/v3'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const parent = await prisma.collectionJob.findUnique({ where: { id } })
    if (!parent) return NextResponse.json(errorResponse(JOB_080), { status: 404 })
    if (parent.userId !== user.id) return NextResponse.json(errorResponse(JOB_051), { status: 403 })

    if (parent.status !== CollectionJobStatus.FAILED) {
      return NextResponse.json(errorResponse(JOB_052), { status: 409 })
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
    })

    try {
      await tasks.trigger('collect-leads', {
        jobId: retry.id,
        query: retry.niche,
        location: retry.state ? `${retry.city}, ${retry.state}` : retry.city,
        maxResults: retry.limitVal ?? 100,
      })
    } catch (err) {
      console.error('[job.retry] trigger.dev falhou, job fica PENDING:', err)
    }

    await AuditService.log({
      userId: user.id,
      action: 'job.retried',
      resource: 'collection_job',
      resourceId: retry.id,
      metadata: { parentId: parent.id },
    })

    return successResponse({ id: retry.id, parentId: parent.id })
  } catch (error) {
    return handleApiError(error)
  }
}
