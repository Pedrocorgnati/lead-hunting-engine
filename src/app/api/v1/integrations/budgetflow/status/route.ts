import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getBudgetFlowStatus, getBudgetFlowPayload } from '@/lib/integrations/budgetflow-service'

/**
 * GET /api/v1/integrations/budgetflow/status?id=<pushId>[&download=1]
 *
 * Status de um push BudgetFlow (DB-backed, ownership obrigatorio).
 * `download=1` baixa o payload canonico gerado (somente COMPLETED).
 * Consumido pelo polling de A18 /exportar/budgetflow.
 */
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

    if (searchParams.get('download') === '1') {
      const payload = await getBudgetFlowPayload(user.id, pushId)
      if (!payload) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Payload indisponivel (push inexistente ou nao concluido).' } },
          { status: 404 },
        )
      }
      return new NextResponse(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="budgetflow-push-${pushId}.json"`,
        },
      })
    }

    const status = await getBudgetFlowStatus(user.id, pushId)
    if (!status) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Push nao encontrado.' } },
        { status: 404 },
      )
    }

    return successResponse(status)
  } catch (error) {
    return handleApiError(error)
  }
}
