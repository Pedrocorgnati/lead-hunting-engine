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
    const snapshots = await prisma.auditLog.findMany({
      where: { resource: 'lead', resourceId: id, action: { contains: 'snapshot' } },
      orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, createdAt: true, metadata: true },
    })
    return successResponse({ snapshots: snapshots.map((s) => ({
      id: s.id, createdAt: s.createdAt.toISOString(),
      score: (s.metadata as Record<string,unknown>)?.score ?? 0,
      changeCount: (s.metadata as Record<string,unknown>)?.changeCount ?? 0,
      fields: (s.metadata as Record<string,unknown>)?.fields ?? {},
    })) })
  } catch (e) { return handleApiError(e) }
}
