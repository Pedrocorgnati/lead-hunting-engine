import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params

    const user = await prisma.userProfile.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!user) {
      return Response.json(
        { error: { code: 'USER_001', message: 'Usuário não encontrado.' } },
        { status: 404 },
      )
    }

    const [
      collectionsCount,
      leadsReviewed,
      exportsCount,
      jobsTotal,
      jobsFailed,
      lastAudit,
    ] = await Promise.all([
      prisma.collectionJob.count({ where: { userId: id } }),
      prisma.lead.count({ where: { userId: id } }),
      prisma.exportHistory.count({ where: { userId: id } }),
      prisma.collectionJob.count({ where: { userId: id } }),
      prisma.collectionJob.count({ where: { userId: id, status: 'FAILED' } }),
      prisma.auditLog.findFirst({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])

    const failureRate = jobsTotal > 0 ? Math.round((jobsFailed / jobsTotal) * 1000) / 10 : 0

    return successResponse({
      collectionsCount,
      leadsReviewed,
      exportsCount,
      failureRate,
      lastActiveAt: lastAudit?.createdAt ?? null,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
