import { type NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { captureLeadSnapshot } from '@/lib/leads/radar-snapshot'

/**
 * POST /api/v1/leads/:id/radar/trigger
 *
 * Captura um snapshot REAL do lead (campos rastreados + diff vs captura
 * anterior) e o registra no historico do radar (Task 35 / B10).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lead = await prisma.lead.findFirst({ where: { id, userId: user.id } })
    if (!lead) return new Response(JSON.stringify({ error: { code: 'LEAD_080' } }), { status: 404 })
    const snapshot = await captureLeadSnapshot(user.id, lead)
    return successResponse({ triggered: true, snapshot })
  } catch (e) { return handleApiError(e) }
}
