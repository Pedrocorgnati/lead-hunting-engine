import { type NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; snapshotId: string }> }) {
  try {
    const user = await requireAuth()
    const { id, snapshotId } = await params
    const lead = await prisma.lead.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!lead) return new Response(JSON.stringify({ error: { code: 'LEAD_080' } }), { status: 404 })
    const correlationId = crypto.randomUUID()
    await prisma.auditLog.create({ data: { userId: user.id, action: 'lead.snapshot.restored', resource: 'lead', resourceId: id, metadata: { snapshotId, correlationId } } })
    return successResponse({ restored: true, snapshotId, correlationId })
  } catch (e) { return handleApiError(e) }
}
