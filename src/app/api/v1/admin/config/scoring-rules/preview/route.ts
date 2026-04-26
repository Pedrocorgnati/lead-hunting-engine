import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getPrisma } from '@/lib/prisma'
import {
  computePreviewDelta,
  type PreviewLeadInput,
  type ScoreBreakdown,
} from '@/lib/intelligence/scoring/preview'

const SAMPLE_LIMIT = 1000

const PreviewSchema = z.object({
  ruleSlug: z.string().min(1),
  newWeight: z.number().int().min(0).max(100),
})

/**
 * POST /api/v1/admin/config/scoring-rules/preview
 *
 * Simula impacto de alterar o peso de UMA regra. Nao persiste. Retorna
 * contagem de leads que mudariam de temperatura.
 *
 * Body: { ruleSlug: string, newWeight: 0..100 }
 * RBAC: ADMIN only. Tenant-scoped (userId da sessao).
 * Performance: limitado a amostra aleatoria de 1000 leads quando total > 1000.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const body = await request.json()
    const parsed = PreviewSchema.parse(body)

    const prisma = getPrisma()
    const totalLeads = await prisma.lead.count({ where: { userId: user.id } })

    if (totalLeads === 0) {
      return successResponse({
        totalLeads: 0,
        sampled: false,
        changes: {
          coldToWarm: 0,
          warmToHot: 0,
          warmToCold: 0,
          hotToWarm: 0,
          coldToHot: 0,
          hotToCold: 0,
          unchanged: 0,
        },
      })
    }

    const sampled = totalLeads > SAMPLE_LIMIT
    const rows = await prisma.lead.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        score: true,
        temperature: true,
        scoreBreakdown: true,
      },
      take: sampled ? SAMPLE_LIMIT : totalLeads,
      // amostragem simples: ordem do DB. Trade-off aceito: stats rapidos, nao cientificos.
      orderBy: sampled ? { updatedAt: 'desc' } : undefined,
    })

    const leads: PreviewLeadInput[] = rows.map((r) => ({
      id: r.id,
      currentScore: r.score,
      currentTemperature: r.temperature,
      breakdown: (r.scoreBreakdown as unknown as ScoreBreakdown | null) ?? null,
    }))

    const changes = computePreviewDelta(leads, parsed.ruleSlug, parsed.newWeight)

    return successResponse({
      totalLeads,
      sampled,
      changes,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
