import { type NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lead = await prisma.lead.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!lead) return new Response(JSON.stringify({ error: { code: 'LEAD_080' } }), { status: 404 })
    return successResponse({ leadId: id, diff: {}, generatedAt: new Date().toISOString() })
  } catch (e) { return handleApiError(e) }
}
