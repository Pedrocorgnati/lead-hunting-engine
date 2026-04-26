import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/export/history
 *
 * Lista paginada do historico de exports do usuario autenticado.
 * Origem: TASK-22 intake-review / ST004 (CL-296).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))

    const [rows, total] = await Promise.all([
      prisma.exportHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          format: true,
          status: true,
          rowCount: true,
          fileSize: true,
          error: true,
          startedAt: true,
          completedAt: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      prisma.exportHistory.count({ where: { userId: user.id } }),
    ])

    return paginatedResponse(rows, { page, limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}
