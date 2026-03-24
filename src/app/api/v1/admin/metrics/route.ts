import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { CollectionJobStatus, InviteStatus } from '@/lib/constants/enums'

/**
 * GET /api/v1/admin/metrics
 * Retorna 5 KPIs do sistema em paralelo via Promise.all (TTFB < 200ms p95).
 * RBAC: apenas ADMIN — 403 para OPERATOR.
 */
export async function GET(_request: NextRequest) {
  try {
    await requireAdmin()

    const [
      totalUsers,
      totalLeads,
      totalJobs,
      activeJobs,
      pendingInvites,
      activeCredentials,
    ] = await Promise.all([
      prisma.userProfile.count(),
      prisma.lead.count(),
      prisma.collectionJob.count(),
      prisma.collectionJob.count({ where: { status: CollectionJobStatus.RUNNING } }),
      prisma.invite.count({ where: { status: InviteStatus.PENDING } }),
      prisma.apiCredential.count({ where: { isActive: true } }),
    ])

    return successResponse({
      users: { total: totalUsers },
      leads: { total: totalLeads },
      jobs: { total: totalJobs, active: activeJobs },
      invites: { pending: pendingInvites },
      credentials: { active: activeCredentials },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
