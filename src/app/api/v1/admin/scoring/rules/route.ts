import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { configService } from '@/services/config.service'

const batchUpdateSchema = z.object({
  rules: z
    .array(z.object({ slug: z.string().min(1), weight: z.number().min(0).max(100) }))
    .refine(
      (rules) => Math.abs(rules.reduce((sum, r) => sum + r.weight, 0) - 100) < 0.01,
      { message: 'A soma dos pesos deve ser 100%' }
    ),
})

/**
 * GET /api/v1/admin/scoring/rules
 * Retorna todas as regras de scoring ordenadas por sortOrder.
 * Alias canonico para /api/v1/admin/config/scoring-rules.
 * RBAC: apenas ADMIN.
 */
export async function GET() {
  try {
    await requireAdmin()
    const rules = await configService.getScoringRules()
    return successResponse({ rules })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/v1/admin/scoring/rules
 * Atualiza pesos em lote com transacao atomica. Valida soma = 100%.
 * Alias canonico para PUT /api/v1/admin/config/scoring-rules.
 * RBAC: apenas ADMIN.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const body = await request.json()
    const parsed = batchUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: 'Dados invalidos', details: parsed.error.flatten() },
        { status: 422 }
      )
    }
    await configService.batchUpdateScoringRules(parsed.data.rules, user.id)
    return successResponse({ message: 'Regras de scoring atualizadas.' })
  } catch (error) {
    return handleApiError(error)
  }
}
