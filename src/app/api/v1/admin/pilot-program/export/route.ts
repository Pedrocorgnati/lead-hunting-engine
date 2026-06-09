import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { AuditService } from '@/lib/services/audit-service'
import { CollectionJobStatus } from '@/lib/constants/enums'
import { isPilotTag, pilotTagsOf } from '@/lib/pilot-program'

const QuerySchema = z.object({ tag: z.string().trim().optional() })

const CSV_HEADERS = [
  'userId',
  'email',
  'name',
  'role',
  'pilotTags',
  'onboardingCompleted',
  'joinedAt',
  'leadsCount',
  'activeJobs',
  'lastNpsScore',
  'lastNpsAt',
]

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = typeof value === 'string' ? value : String(value)
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

/**
 * GET /api/v1/admin/pilot-program/export?tag=pilot-... — Task 56 / C6.
 *
 * Relatorio exportavel do programa piloto em CSV: cada participante do cohort
 * com metricas derivadas (leads, jobs ativos, ultimo NPS). Reaproveita os
 * mesmos dados da tela, sem persistir relatorio. Cumpre o aceite
 * "programa piloto tem ... relatorio exportavel".
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const { searchParams } = new URL(request.url)
    const { tag } = QuerySchema.parse(Object.fromEntries(searchParams))

    const candidates = await prisma.userProfile.findMany({
      where:
        tag && isPilotTag(tag)
          ? { tags: { has: tag } }
          : { NOT: { tags: { isEmpty: true } } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tags: true,
        onboardingCompletedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    const cohort = candidates.filter((u) => pilotTagsOf(u.tags).length > 0)
    const ids = cohort.map((u) => u.id)

    const [leadCounts, activeJobCounts, lastNps] = await Promise.all([
      ids.length
        ? prisma.lead.groupBy({
            by: ['userId'],
            where: { userId: { in: ids } },
            _count: { _all: true },
          })
        : Promise.resolve([] as { userId: string; _count: { _all: number } }[]),
      ids.length
        ? prisma.collectionJob.groupBy({
            by: ['userId'],
            where: { userId: { in: ids }, status: CollectionJobStatus.RUNNING },
            _count: { _all: true },
          })
        : Promise.resolve([] as { userId: string; _count: { _all: number } }[]),
      ids.length
        ? prisma.npsResponse.findMany({
            where: { userId: { in: ids } },
            orderBy: { submittedAt: 'desc' },
            distinct: ['userId'],
            select: { userId: true, score: true, submittedAt: true },
          })
        : Promise.resolve([] as { userId: string; score: number; submittedAt: Date }[]),
    ])

    const leadByUser = new Map(leadCounts.map((r) => [r.userId, r._count._all]))
    const jobByUser = new Map(activeJobCounts.map((r) => [r.userId, r._count._all]))
    const npsByUser = new Map(lastNps.map((r) => [r.userId, r]))

    const lines = [CSV_HEADERS.join(',')]
    for (const u of cohort) {
      const nps = npsByUser.get(u.id)
      lines.push(
        [
          u.id,
          u.email,
          u.name ?? '',
          u.role,
          pilotTagsOf(u.tags).join('|'),
          u.onboardingCompletedAt !== null ? 'sim' : 'nao',
          u.createdAt.toISOString(),
          leadByUser.get(u.id) ?? 0,
          jobByUser.get(u.id) ?? 0,
          nps?.score ?? '',
          nps?.submittedAt.toISOString() ?? '',
        ]
          .map(escapeCsv)
          .join(','),
      )
    }
    const csv = lines.join('\n') + '\n'

    await AuditService.log({
      userId: admin.id,
      action: 'pilot.report_exported',
      resource: 'pilot_program',
      metadata: { rows: cohort.length, tag: tag ?? 'all' },
    })

    const filename = `programa-piloto-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
