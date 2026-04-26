import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * TASK-25/ST004 (CL-109): agregador GLOBAL de falso-positivo.
 * GET /api/v1/admin/metrics/false-positive?days=30
 * Retorna totalLeads, falsePositives e rate agregados para TODOS os usuarios.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const daysParam = request.nextUrl.searchParams.get('days')
    const days = Math.max(1, Math.min(365, Number(daysParam) || 30))
    const since = new Date(Date.now() - days * 86_400_000)

    const [totalLeads, falsePositives] = await Promise.all([
      prisma.lead.count({ where: { createdAt: { gte: since } } }),
      prisma.lead.count({ where: { createdAt: { gte: since }, status: 'FALSE_POSITIVE' } }),
    ])

    const rate = totalLeads > 0 ? falsePositives / totalLeads : null

    return successResponse({
      days,
      totalLeads,
      falsePositives,
      rate,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
