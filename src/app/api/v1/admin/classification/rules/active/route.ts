import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getPrisma } from '@/lib/prisma'

/**
 * GET /api/v1/admin/classification/rules/active
 * Retorna todas as regras de classificacao A-E ativas ordenadas por sortOrder.
 * RBAC: apenas ADMIN.
 */
export async function GET() {
  try {
    await requireAdmin()
    const prisma = getPrisma()
    const rules = await prisma.classificationRule.findMany({
      orderBy: { sortOrder: 'asc' },
    })
    return successResponse({ rules })
  } catch (error) {
    return handleApiError(error)
  }
}
