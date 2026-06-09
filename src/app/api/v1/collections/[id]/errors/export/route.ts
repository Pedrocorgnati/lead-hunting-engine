import { type NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { buildErrorList } from '../_errors-mapper'
import { maskPiiDeep } from '@/lib/pii-mask'

/**
 * GET /api/v1/collections/:id/errors/export
 * Exporta o log de erros como JSON com PII mascarada (Content-Disposition: attachment).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const job = await prisma.collectionJob.findFirst({
      where: { id, userId: user.id },
      select: { id: true, errorLog: true, errorMessage: true },
    })
    if (!job) {
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Coleta nao encontrada.' } }), { status: 404 })
    }

    const errors = buildErrorList(id, job.errorLog, job.errorMessage)
    const masked = maskPiiDeep({
      collectionId: id,
      exportedAt: new Date().toISOString(),
      total: errors.length,
      errors,
    })

    const body = JSON.stringify(masked, null, 2)
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="coleta-${id}-erros.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
