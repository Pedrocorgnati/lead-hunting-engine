import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const user = await requireAuth()
    const { id, versionId } = await params
    const isAdmin = user.role === 'ADMIN'

    const template = await prisma.pitchTemplate.findFirst({
      where: isAdmin ? { id } : { id, userId: user.id },
      select: { id: true, name: true, content: true, tone: true },
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

    const version = await prisma.pitchTemplateVersion.findFirst({
      where: { id: versionId, pitchTemplateId: id },
    })

    if (!version) {
      return NextResponse.json(
        {
          error: {
            code: 'PITCH_TEMPLATE_090',
            message: 'Versão do template não encontrada.',
          },
        },
        { status: 404 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.pitchTemplateVersion.create({
        data: {
          pitchTemplateId: id,
          name: template.name,
          content: template.content,
          tone: template.tone,
        },
      })

      return tx.pitchTemplate.update({
        where: { id },
        data: {
          name: version.name,
          content: version.content,
          tone: version.tone,
        },
      })
    })

    return successResponse(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
