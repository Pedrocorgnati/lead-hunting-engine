/**
 * TASK-16/ST004 (CL-267): SavedView per-user.
 * GET  /api/v1/views                -> lista
 * POST /api/v1/views { name, filters } -> cria/atualiza
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

const CreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  filters: z.record(z.string(), z.unknown()),
})

export async function GET() {
  try {
    const user = await requireAuth()
    const views = await prisma.savedView.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return successResponse({
      views: views.map((v) => ({
        id: v.id,
        name: v.name,
        filters: v.filters,
        createdAt: v.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = CreateBody.parse(await request.json())

    const view = await prisma.savedView.upsert({
      where: { userId_name: { userId: user.id, name: body.name } },
      create: {
        userId: user.id,
        name: body.name,
        filters: body.filters as unknown as object,
      },
      update: { filters: body.filters as unknown as object },
    })
    return successResponse(
      {
        view: {
          id: view.id,
          name: view.name,
          filters: view.filters,
          createdAt: view.createdAt.toISOString(),
        },
      },
      201,
    )
  } catch (error) {
    return handleApiError(error)
  }
}
