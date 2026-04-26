import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireAdmin()

    const expiring = await prisma.lead.findMany({
      where: { retentionUntil: { not: null } },
      orderBy: { retentionUntil: 'asc' },
      take: 20,
      select: {
        id: true,
        businessName: true,
        retentionUntil: true,
        status: true,
      },
    })

    const lastCleanup = await prisma.auditLog.findFirst({
      where: { action: 'RETENTION_CLEANUP' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, metadata: true },
    })

    return successResponse({ expiring, lastCleanup })
  } catch (error) {
    return handleApiError(error)
  }
}
