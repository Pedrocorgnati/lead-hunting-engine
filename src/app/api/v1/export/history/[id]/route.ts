import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { AuditService } from '@/lib/services/audit-service'

/**
 * DELETE /api/v1/export/history/[id]
 *
 * Remove uma exportacao do historico do usuario (ownership por userId).
 * Consumido pela acao "Remover" da tela A17 /exportar/historico (G6 confirm).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const row = await prisma.exportHistory.findFirst({
      where: { id, userId: user.id },
      select: { id: true, format: true, status: true },
    })
    if (!row) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Exportacao nao encontrada.' } },
        { status: 404 },
      )
    }

    await prisma.exportHistory.delete({ where: { id } })

    await AuditService.log({
      userId: user.id,
      action: 'export.deleted',
      resource: 'export_history',
      resourceId: id,
      metadata: { format: row.format, status: row.status },
    })

    return successResponse({ id, deleted: true })
  } catch (error) {
    return handleApiError(error)
  }
}
