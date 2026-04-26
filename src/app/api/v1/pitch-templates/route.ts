import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  handleApiError,
  successResponse,
  paginatedResponse,
} from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import {
  PitchTemplateCreateSchema,
  PitchTemplateListQuerySchema,
} from '@/lib/schemas/pitch-template'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()

    const url = new URL(request.url)
    const query = PitchTemplateListQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries())
    )

    const where: Record<string, unknown> = { userId: user.id }
    if (query.tone) where.tone = query.tone
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const skip = Math.max(0, (query.page - 1) * query.limit)

    const [data, total] = await Promise.all([
      prisma.pitchTemplate.findMany({
        where,
        orderBy: [{ isFavorite: 'desc' }, { updatedAt: 'desc' }],
        take: query.limit,
        skip,
      }),
      prisma.pitchTemplate.count({ where }),
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()

    const raw = await request.json()
    const data = PitchTemplateCreateSchema.parse(raw)

    // Se o novo template for favorito, desmarcar o favorito anterior do usuário
    const created = await prisma.$transaction(async (tx) => {
      if (data.isFavorite) {
        await tx.pitchTemplate.updateMany({
          where: { userId: user.id, isFavorite: true },
          data: { isFavorite: false },
        })
      }
      return tx.pitchTemplate.create({
        data: {
          userId: user.id,
          name: data.name,
          content: data.content,
          tone: data.tone,
          isFavorite: data.isFavorite,
        },
      })
    })

    return successResponse(created, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
