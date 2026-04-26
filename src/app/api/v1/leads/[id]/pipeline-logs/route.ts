/**
 * TASK-16/ST002 (CL-488): timeline cronologica do pipeline por lead.
 * Agrega LeadHistory + ApiUsageLog (inclui LLM) em uma lista ordenada desc.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { errorResponse, LEAD_080 } from '@/constants/errors'

export type PipelineEventKind =
  | 'history.field_changed'
  | 'api.call'
  | 'llm.call'

export interface PipelineEvent {
  kind: PipelineEventKind
  at: string
  meta: Record<string, unknown>
  costUsd?: number
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const daysParam = request.nextUrl.searchParams.get('days')
    const days = Math.max(1, Math.min(365, Number(daysParam) || 90))
    const since = new Date(Date.now() - days * 86_400_000)

    const whereOwnership = user.role === 'ADMIN' ? { id } : { id, userId: user.id }
    const lead = await prisma.lead.findFirst({ where: whereOwnership, select: { id: true } })
    if (!lead) return NextResponse.json(errorResponse(LEAD_080), { status: 404 })

    const [history, usage] = await Promise.all([
      prisma.leadHistory.findMany({
        where: { leadId: id, changedAt: { gte: since } },
        orderBy: { changedAt: 'desc' },
        take: 500,
      }),
      prisma.apiUsageLog.findMany({
        where: { leadId: id, timestamp: { gte: since } },
        orderBy: { timestamp: 'desc' },
        take: 500,
      }),
    ])

    const events: PipelineEvent[] = []

    for (const h of history) {
      events.push({
        kind: 'history.field_changed',
        at: h.changedAt.toISOString(),
        meta: {
          field: h.field,
          oldValue: h.oldValue,
          newValue: h.newValue,
        },
      })
    }

    for (const u of usage) {
      events.push({
        kind: u.kind === 'LLM' ? 'llm.call' : 'api.call',
        at: u.timestamp.toISOString(),
        meta: {
          provider: u.provider,
          operation: u.operation ?? null,
          model: (u as { model?: string | null }).model ?? null,
          callType: u.callType,
        },
        costUsd: u.costUsd ? Number(u.costUsd) : undefined,
      })
    }

    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

    const totalCostUsd = events.reduce((s, e) => s + (e.costUsd ?? 0), 0)
    return successResponse({ events, totalCostUsd, days })
  } catch (error) {
    return handleApiError(error)
  }
}
