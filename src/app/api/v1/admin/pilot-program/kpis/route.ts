import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { CollectionJobStatus } from '@/lib/constants/enums'
import { isPilotTag, pilotTagsOf } from '@/lib/pilot-program'

const QuerySchema = z.object({ tag: z.string().trim().optional() })

/**
 * GET /api/v1/admin/pilot-program/kpis — Task 56 / C6.
 *
 * KPIs do programa piloto, todos DERIVADOS de dados existentes (cohort por
 * tags, leads, NPS, jobs). Nenhuma metrica nova persistida.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const { tag } = QuerySchema.parse(Object.fromEntries(searchParams))

    // Resolve o cohort (ids) com o mesmo criterio do endpoint de cohort.
    const candidates = await prisma.userProfile.findMany({
      where:
        tag && isPilotTag(tag)
          ? { tags: { has: tag } }
          : { NOT: { tags: { isEmpty: true } } },
      select: { id: true, tags: true },
    })
    const cohort = candidates.filter((u) => pilotTagsOf(u.tags).length > 0)
    const ids = cohort.map((u) => u.id)

    const cohortSize = cohort.length

    if (ids.length === 0) {
      return successResponse({
        cohortSize: 0,
        totalLeads: 0,
        activeJobs: 0,
        npsResponses: 0,
        npsAverage: null,
        periods: [] as string[],
      })
    }

    const [totalLeads, activeJobs, npsAgg] = await Promise.all([
      prisma.lead.count({ where: { userId: { in: ids } } }),
      prisma.collectionJob.count({
        where: { userId: { in: ids }, status: CollectionJobStatus.RUNNING },
      }),
      prisma.npsResponse.aggregate({
        where: { userId: { in: ids } },
        _avg: { score: true },
        _count: { _all: true },
      }),
    ])

    // Distintos periodos (tags) presentes no cohort, para a UI listar filtros.
    const periods = Array.from(
      new Set(cohort.flatMap((u) => pilotTagsOf(u.tags))),
    ).sort()

    return successResponse({
      cohortSize,
      totalLeads,
      activeJobs,
      npsResponses: npsAgg._count._all,
      npsAverage:
        npsAgg._avg.score !== null ? Math.round(npsAgg._avg.score * 10) / 10 : null,
      periods,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
