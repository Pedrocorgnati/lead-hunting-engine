import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'

const ValidateSchema = z.object({
  campaignId: z.string().trim().min(1, 'ID da campanha obrigatorio'),
  budget: z.string().min(1, 'Orcamento obrigatorio'),
  currency: z.enum(['BRL', 'USD', 'EUR']),
  note: z.string().max(500).optional(),
})

/**
 * POST /api/v1/integrations/budgetflow/validate
 *
 * Pre-valida o payload BudgetFlow antes do push.
 * Retorna os dados normalizados ou erro de validacao detalhado.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth()

    const body = await request.json()
    const data = ValidateSchema.parse(body)

    // Validacoes de negocio adicionais
    const budgetNum = Number(data.budget.replace(/[^0-9.,]/g, '').replace(',', '.'))
    if (Number.isNaN(budgetNum) || budgetNum <= 0) {
      return NextResponse.json(
        { error: { code: 'BUDGET_INVALID', message: 'O valor do orcamento deve ser um numero positivo.' } },
        { status: 400 }
      )
    }

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
