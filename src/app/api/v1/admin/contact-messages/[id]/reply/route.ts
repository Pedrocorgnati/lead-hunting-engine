import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import { contactReplySchema } from '@/lib/schemas/landing'

/**
 * POST /api/v1/admin/contact-messages/[id]/reply — TASK-2/ST005 (CL-494)
 * Transita NEW/READ -> REPLIED, registra o conteudo da resposta e
 * (opcionalmente) dispara email via Resend quando configurado.
 * Email real: fora do escopo P0 — resposta manual do admin via email client
 * externo aceita-se por ora; o endpoint registra a resposta textual.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params

    const body = await request.json().catch(() => null)
    const parsed = contactReplySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Resposta invalida.',
            details: parsed.error.issues
              .map((i) => `${i.path?.join('.') ?? ''}: ${i.message}`)
              .join('; '),
          },
        },
        { status: 400 },
      )
    }

    const message = await prisma.contactMessage.findUnique({ where: { id } })
    if (!message) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Mensagem nao encontrada.' } },
        { status: 404 },
      )
    }

    if (message.status === 'REPLIED' || message.status === 'ARCHIVED') {
      return NextResponse.json(
        {
          error: {
            code: 'CONTACT_INVALID_TRANSITION',
            message: `Nao e possivel responder uma mensagem em status ${message.status}.`,
          },
        },
        { status: 409 },
      )
    }

    const updated = await prisma.contactMessage.update({
      where: { id },
      data: {
        status: 'REPLIED',
        repliedAt: new Date(),
        repliedById: admin.id,
        replyContent: parsed.data.replyContent,
      },
    })

    await AuditService.log({
      userId: admin.id,
      action: 'contact.replied',
      resource: 'contact_message',
      resourceId: id,
      metadata: {
        targetEmail: message.email,
        replyPreview: parsed.data.replyContent.slice(0, 100),
      },
    })

    return successResponse({
      id: updated.id,
      status: updated.status,
      repliedAt: updated.repliedAt,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
