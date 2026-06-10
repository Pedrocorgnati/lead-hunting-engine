import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { restoreLeadSnapshot } from '@/lib/leads/radar-snapshot'

/**
 * POST /api/v1/leads/:id/snapshots/:snapshotId/restore
 *
 * Reverte os campos rastreados do lead para os valores do snapshot e
 * registra a reversao como novo snapshot (Task 35 / B10). Snapshots legados
 * sem `values` retornam 422 SNAPSHOT_NOT_RESTORABLE (sem falso sucesso).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; snapshotId: string }> }) {
  try {
    const user = await requireAuth()
    const { id, snapshotId } = await params
    const lead = await prisma.lead.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!lead) return new Response(JSON.stringify({ error: { code: 'LEAD_080' } }), { status: 404 })

    const restored = await restoreLeadSnapshot(user.id, id, snapshotId)
    if (!restored) {
      return NextResponse.json(
        { error: { code: 'SNAPSHOT_NOT_FOUND', message: 'Snapshot nao encontrado para este lead.' } },
        { status: 404 },
      )
    }
    return successResponse({ restored: true, snapshotId, snapshot: restored })
  } catch (e) { return handleApiError(e) }
}
