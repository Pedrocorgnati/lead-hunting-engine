import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import {
  BudgetFlowPushSchema,
  createBudgetFlowPush,
  getBudgetFlowStatus,
} from '@/lib/integrations/budgetflow-service'

/**
 * Alias legado de /api/v1/integrations/budgetflow.
 *
 * POST -> mesmo contrato de /push; GET ?id= -> mesmo contrato de /status.
 * Mantido por compatibilidade (clientes antigos); a implementacao canonica
 * (DB-backed, multi-instancia safe) vive em budgetflow-service — o store em
 * memoria anterior foi removido.
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

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const pushId = searchParams.get('id')

    if (!pushId) {
      return NextResponse.json(
        { error: { code: 'MISSING_PARAM', message: 'Parametro id obrigatorio.' } },
        { status: 400 },
      )
    }

    const status = await getBudgetFlowStatus(user.id, pushId)
    if (!status) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Job nao encontrado.' } },
        { status: 404 },
      )
    }

    return successResponse(status)
  } catch (error) {
    return handleApiError(error)
  }
}
