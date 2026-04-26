import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/export/[id]/download
 *
 * Retorna redirect 302 para a signed URL quando:
 *   - Export pertence ao usuario autenticado
 *   - status == COMPLETED
 *   - now() < expiresAt (senao 410 Gone)
 *
 * Origem: TASK-22 intake-review / ST004 (CL-492, CL-493).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const row = await prisma.exportHistory.findUnique({ where: { id } })
    if (!row || row.userId !== user.id) {
      return NextResponse.json(
        { error: { code: 'EXPORT_NOT_FOUND', message: 'Exportacao nao encontrada.' } },
        { status: 404 }
      )
    }

    if (row.status !== 'COMPLETED' || !row.fileUrl) {
      return NextResponse.json(
        {
          error: {
            code: 'EXPORT_NOT_READY',
            message: 'Exportacao ainda nao esta pronta.',
            details: { status: row.status },
          },
        },
        { status: 409 }
      )
    }

    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      // Marca EXPIRED se ainda nao estiver
      await prisma.exportHistory
        .update({
          where: { id },
          data: { status: 'EXPIRED', fileUrl: null },
        })
        .catch(() => undefined)
      return NextResponse.json(
        {
          error: {
            code: 'EXPORT_EXPIRED',
            message: 'Este link expirou. Gere uma nova exportacao.',
          },
        },
        { status: 410 }
      )
    }

    return NextResponse.redirect(row.fileUrl, { status: 302 })
  } catch (error) {
    return handleApiError(error)
  }
}
