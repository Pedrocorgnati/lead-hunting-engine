import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getPrisma } from '@/lib/prisma'

/**
 * GET /api/v1/admin/scoring/rules/versions
 * Retorna historico global de todas as regras de scoring.
 * Inclui snapshot, quem alterou, motivo e timestamp.
 * RBAC: apenas ADMIN.
 */
export async function GET() {
  try {
    await requireAdmin()
    const prisma = getPrisma()

    const versions = await prisma.scoringRuleHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        rule: {
          select: { name: true, slug: true },
        },
      },
    })

    return successResponse({ versions })
  } catch (error) {
    return handleApiError(error)
  }
}
