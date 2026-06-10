import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import {
  BudgetFlowPushSchema,
  normalizeBudget,
  assertLeadsReady,
} from '@/lib/integrations/budgetflow-service'

/**
 * POST /api/v1/integrations/budgetflow/validate
 *
 * Pre-valida o payload BudgetFlow antes do push (mesmo schema + normalizacao
 * de budget + readiness dos leadIds, compartilhados com /push via
 * budgetflow-service). Retorna os dados normalizados ou erro detalhado.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()

    const data = BudgetFlowPushSchema.parse(await request.json())
    const budgetNum = normalizeBudget(data.budget)
    await assertLeadsReady(user.id, data.leadIds ?? [])

    return successResponse({
      valid: true,
      normalized: {
        ...data,
        budget: budgetNum,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
