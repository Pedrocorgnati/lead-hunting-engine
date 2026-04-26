/**
 * TASK-16/ST003 (CL-490): autocomplete de tags ja usadas pelo usuario.
 * GET /api/v1/leads/[id]/tags/suggest?q=prefix -> labels distintos (top 10)
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 20)

    const rows = await prisma.leadTag.findMany({
      where: {
        userId: user.id,
        ...(q ? { label: { startsWith: q, mode: 'insensitive' } } : {}),
      },
      select: { label: true },
      distinct: ['label'],
      orderBy: { label: 'asc' },
      take: 10,
    })
    return successResponse({ labels: rows.map((r) => r.label) })
  } catch (error) {
    return handleApiError(error)
  }
}
