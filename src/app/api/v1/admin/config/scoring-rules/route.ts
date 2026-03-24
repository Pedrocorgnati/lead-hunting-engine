import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { configService } from '@/services/config.service'

/**
 * GET /api/v1/admin/config/scoring-rules
 * Retorna todas as regras ordenadas por sortOrder.
 * RBAC: apenas ADMIN.
 */
export async function GET() {
  try {
    await requireAdmin()
    const rules = await configService.getScoringRules()
    return successResponse(rules)
  } catch (error) {
    return handleApiError(error)
  }
}

const batchUpdateSchema = z.object({
  rules: z
    .array(z.object({ slug: z.string().min(1), weight: z.number().min(0).max(100) }))
    .refine(
      rules => Math.abs(rules.reduce((sum, r) => sum + r.weight, 0) - 100) < 0.01,
      { message: 'A soma dos pesos deve ser 100%' }
    ),
})

/**
 * PUT /api/v1/admin/config/scoring-rules
 * Atualiza pesos em lote com transação atômica. Valida soma = 100%.
 * RBAC: apenas ADMIN.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const body = await request.json()
    const parsed = batchUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 422 }
      )
    }
    await configService.batchUpdateScoringRules(parsed.data.rules, user.id)
    return successResponse({ message: 'Regras de scoring atualizadas.' })
  } catch (error) {
    return handleApiError(error)
  }
}
