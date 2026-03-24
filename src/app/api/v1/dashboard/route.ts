import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { leadService } from '@/services/lead.service'

/**
 * GET /api/v1/dashboard
 * Retorna KPIs do dashboard e leads recentes do usuário autenticado.
 * BDD: resposta com { data: { kpis, recentLeads } } | 401 sem autenticação
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const result = await leadService.getDashboardKpis(user.id)
    return NextResponse.json({ data: result })
  } catch (error) {
    return handleApiError(error)
  }
}
