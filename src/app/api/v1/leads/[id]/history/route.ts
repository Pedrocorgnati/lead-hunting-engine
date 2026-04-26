import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { errorResponse, LEAD_080 } from '@/constants/errors'
import { getHistory } from '@/lib/intelligence/enrichment/enrichers/history-tracker'

/**
 * GET /api/v1/leads/[id]/history
 * Retorna historico de mudancas do lead nos ultimos N dias (default: 30).
 * TASK-5 intake-review (CL-066, CL-079).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const url = new URL(request.url)
    const daysParam = parseInt(url.searchParams.get('days') ?? '30', 10)
    const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30

    // RLS: admin ve tudo; operador so os proprios
    const whereOwnership =
      user.role === 'ADMIN' ? { id } : { id, userId: user.id }

    const lead = await prisma.lead.findFirst({
      where: whereOwnership,
      select: { id: true },
    })
    if (!lead) {
      return NextResponse.json(errorResponse(LEAD_080), { status: 404 })
    }

    const history = await getHistory(id, days)
    return successResponse({ history, days })
  } catch (error) {
    return handleApiError(error)
  }
}
