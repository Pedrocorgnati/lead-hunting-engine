import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const { page, limit } = QuerySchema.parse(Object.fromEntries(searchParams))

    const user = await prisma.userProfile.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!user) {
      return Response.json(
        { error: { code: 'USER_001', message: 'Usuário não encontrado.' } },
        { status: 404 },
      )
    }

    const where = { userId: id }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ])

    return paginatedResponse(logs, { page, limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}
