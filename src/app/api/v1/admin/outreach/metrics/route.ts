/**
 * outreach-engine (brainstorm 06-10, task 15 — F-15/F-24): painel de saude
 * operacional. Expoe as 6 metricas minimas da secao 10, os funis por campanha
 * e os alertas obrigatorios. Pre-condicao de ativacao em producao (Task 31).
 */
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { computeOutreachMetrics, computeCampaignFunnels, evaluateOutreachAlerts } from '@/lib/outreach/metrics'

export async function GET() {
  try {
    await requireAdmin()
    const [metrics, funnels, alerts] = await Promise.all([
      computeOutreachMetrics(24),
      computeCampaignFunnels(),
      evaluateOutreachAlerts(),
    ])
    return successResponse({ metrics, funnels, alerts })
  } catch (error) {
    return handleApiError(error)
  }
}
