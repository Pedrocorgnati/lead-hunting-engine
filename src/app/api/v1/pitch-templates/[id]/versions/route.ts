import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  handleApiError,
  successResponse,
  paginatedResponse,
} from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { PitchTemplateVersionListQuerySchema } from '@/lib/schemas/pitch-template'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const isAdmin = user.role === 'ADMIN'

    const url = new URL(request.url)
    const query = PitchTemplateVersionListQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries())
    )

    const template = await prisma.pitchTemplate.findFirst({
      where: isAdmin ? { id } : { id, userId: user.id },
      select: { id: true },
    })

    if (!template) {
      return successResponse({ data: [], page: query.page, limit: query.limit, total: 0 })
    }

    const skip = Math.max(0, (query.page - 1) * query.limit)

    const [data, total] = await Promise.all([
      prisma.pitchTemplateVersion.findMany({
        where: { pitchTemplateId: id },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip,
      }),
      prisma.pitchTemplateVersion.count({ where: { pitchTemplateId: id } }),
    ])

    return paginatedResponse(data, {
      page: query.page,
      limit: query.limit,
      total,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
