import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { BudgetFlowPushSchema, createBudgetFlowPush } from '@/lib/integrations/budgetflow-service'

/**
 * POST /api/v1/integrations/budgetflow/push
 *
 * Cria um push BudgetFlow persistido (budget_flow_pushes) e processa via
 * local-queue kind 'budgetflow-push' com tentativa inline best-effort.
 * Aceita `leadIds` opcionais (mapeamento LHE -> BudgetFlow com readiness
 * check de ownership). Retorna jobId para polling em /status.
 *
 * Consumido por A18 /exportar/budgetflow.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const data = BudgetFlowPushSchema.parse(await request.json())
    const result = await createBudgetFlowPush(user.id, data)
    return successResponse({ ...result, message: 'BudgetFlow enviado para processamento.' }, 202)
  } catch (error) {
    return handleApiError(error)
  }
}
