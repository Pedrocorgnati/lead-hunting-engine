import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import { calculateScore } from '@/lib/intelligence/scoring/scoring-engine'
import { errorResponse, LEAD_050, LEAD_080 } from '@/constants/errors'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const lead = await prisma.lead.findUnique({ where: { id } })
    if (!lead) return NextResponse.json(errorResponse(LEAD_080), { status: 404 })
    if (lead.userId !== user.id) return NextResponse.json(errorResponse(LEAD_050), { status: 403 })

    const enriched = (lead.enrichmentData as { scores?: Record<string, number> } | null) ?? null
    if (!enriched || !enriched.scores) {
      return NextResponse.json(
        { error: { code: 'LEAD_052', message: 'Lead sem dados de enriquecimento para recalcular.' } },
        { status: 422 },
      )
    }

    const oldScore = lead.score
    const result = await calculateScore({ scores: enriched.scores } as never)

    await prisma.$transaction([
      prisma.lead.update({
        where: { id },
        data: {
          score: result.totalScore,
          scoreBreakdown: result.breakdown,
          // TASK-4 intake-review: persistir sinais granulares disparados
          signals: result.signals ?? [],
        },
      }),
      prisma.leadHistory.create({
        data: {
          leadId: id,
          field: 'score',
          oldValue: oldScore,
          newValue: result.totalScore,
        },
      }),
    ])

    await AuditService.log({
      userId: user.id,
      action: 'lead.score_recomputed',
      resource: 'lead',
      resourceId: id,
      metadata: { oldScore, newScore: result.totalScore },
    })

    return successResponse({ score: result.totalScore, breakdown: result.breakdown })
  } catch (error) {
    return handleApiError(error)
  }
}
