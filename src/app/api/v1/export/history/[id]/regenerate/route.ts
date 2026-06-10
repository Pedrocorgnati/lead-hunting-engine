import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { AuditService } from '@/lib/services/audit-service'
import { queueAsyncExport } from '@/lib/export/dispatcher'
import type { Prisma } from '@prisma/client'

/**
 * POST /api/v1/export/history/[id]/regenerate
 *
 * Re-enfileira uma exportacao usando os MESMOS filtros/formato persistidos no
 * registro original (ExportHistory.filters). Cria um novo registro PENDING via
 * queueAsyncExport (mesmo caminho do export assincrono) — o original permanece
 * no historico. 409 se o original ainda esta em processamento.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const row = await prisma.exportHistory.findFirst({
      where: { id, userId: user.id },
      select: { id: true, format: true, status: true, filters: true, rowCount: true },
    })
    if (!row) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Exportacao nao encontrada.' } },
        { status: 404 },
      )
    }
    if (row.status === 'PENDING' || row.status === 'PROCESSING') {
      return NextResponse.json(
        {
          error: {
            code: 'EXPORT_IN_PROGRESS',
            message: 'Esta exportacao ainda esta em processamento; aguarde a conclusao.',
          },
        },
        { status: 409 },
      )
    }

    const queued = await queueAsyncExport({
      userId: user.id,
      format: row.format,
      filters: (row.filters ?? {}) as Prisma.InputJsonValue,
      estimatedRowCount: row.rowCount ?? 0,
    })

    await AuditService.log({
      userId: user.id,
      action: 'export.regenerated',
      resource: 'export_history',
      resourceId: id,
      metadata: { newExportId: queued.id, format: row.format },
    })

    return successResponse({
      originalId: id,
      exportId: queued.id,
      status: queued.status,
      expiresAt: queued.expiresEstimate.toISOString(),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
