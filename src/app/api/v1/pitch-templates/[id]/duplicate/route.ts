import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const isAdmin = user.role === 'ADMIN'

    const template = await prisma.pitchTemplate.findFirst({
      where: isAdmin ? { id } : { id, userId: user.id },
    })
    if (!template) {
      return NextResponse.json(
        {
          error: {
            code: 'PITCH_TEMPLATE_080',
            message: 'Template de pitch não encontrado.',
          },
        },
        { status: 404 }
      )
    }

    const duplicated = await prisma.pitchTemplate.create({
      data: {
        userId: template.userId,
        name: `${template.name} (cópia)`,
        content: template.content,
        tone: template.tone,
        isFavorite: false,
      },
    })

    return successResponse(duplicated, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
