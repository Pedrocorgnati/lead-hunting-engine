import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { errorResponse, LEAD_080 } from '@/constants/errors'
import { prisma } from '@/lib/prisma'
import { serializeBudgetFlow } from '@/lib/export/budgetflow-serializer'

/**
 * GET /api/v1/leads/:id/export/budgetflow
 *
 * Retorna o payload canonico BudgetFlow (sem campos internos/PII).
 * Query `?download=1` forca Content-Disposition attachment.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const lead = await prisma.lead.findFirst({ where: { id, userId: user.id } })
    if (!lead) {
      return NextResponse.json(errorResponse(LEAD_080), { status: 404 })
    }

    const payload = serializeBudgetFlow(lead)
    const url = new URL(request.url)
    const download = url.searchParams.get('download') === '1'

    const body = JSON.stringify(payload, null, 2)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    }
    if (download) {
      const slug = lead.businessName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'lead'
      headers['Content-Disposition'] = `attachment; filename="budgetflow-${slug}-${id}.json"`
    }

    return new NextResponse(body, { status: 200, headers })
  } catch (error) {
    return handleApiError(error)
  }
}
