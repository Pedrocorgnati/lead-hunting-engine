import { type NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { diffLeadSnapshots } from '@/lib/leads/radar-snapshot'

/**
 * GET /api/v1/leads/:id/snapshots/diff[?from=<id>&to=<id>]
 *
 * Diff real entre dois snapshots do lead (default: os dois mais recentes
 * com dados). Task 35 / B10.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lead = await prisma.lead.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!lead) return new Response(JSON.stringify({ error: { code: 'LEAD_080' } }), { status: 404 })
    const { searchParams } = new URL(req.url)
    const result = await diffLeadSnapshots(id, searchParams.get('from'), searchParams.get('to'))
    return successResponse({ ...result, generatedAt: new Date().toISOString() })
  } catch (e) { return handleApiError(e) }
}
