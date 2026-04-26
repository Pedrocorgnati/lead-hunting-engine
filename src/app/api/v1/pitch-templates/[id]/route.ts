import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { PitchTemplateUpdateSchema } from '@/lib/schemas/pitch-template'

const NOT_FOUND = {
  error: {
    code: 'PITCH_TEMPLATE_080',
    message: 'Template de pitch não encontrado.',
  },
}

async function findOwned(id: string, userId: string, isAdmin: boolean) {
  return prisma.pitchTemplate.findFirst({
    where: isAdmin ? { id } : { id, userId },
    select: { id: true, userId: true, isFavorite: true },
  })
}

export async function GET(
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
      return NextResponse.json(NOT_FOUND, { status: 404 })
    }

    return successResponse(template)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const isAdmin = user.role === 'ADMIN'

    const existing = await findOwned(id, user.id, isAdmin)
    if (!existing) {
      return NextResponse.json(NOT_FOUND, { status: 404 })
    }

    const raw = await request.json()
    const data = PitchTemplateUpdateSchema.parse(raw)

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isFavorite === true) {
        await tx.pitchTemplate.updateMany({
          where: { userId: existing.userId, isFavorite: true, NOT: { id } },
          data: { isFavorite: false },
        })
      }
      return tx.pitchTemplate.update({
        where: { id },
        data,
      })
    })

    return successResponse(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const isAdmin = user.role === 'ADMIN'

    const existing = await findOwned(id, user.id, isAdmin)
    if (!existing) {
      return NextResponse.json(NOT_FOUND, { status: 404 })
    }

    // Safeguard: não permitir deletar o template marcado como favorito
    // (o usuário deve escolher outro favorito antes).
    if (existing.isFavorite) {
      return NextResponse.json(
        {
          error: {
            code: 'PITCH_TEMPLATE_051',
            message:
              'Não é possível remover o template favorito. Marque outro como favorito antes.',
          },
        },
        { status: 409 }
      )
    }

    await prisma.pitchTemplate.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
