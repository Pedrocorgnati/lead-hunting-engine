import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, AuthError } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { getClientIp } from '@/lib/rate-limiter'
import { AUTH_001, AUTH_004, SYS_001, USER_080 } from '@/constants/errors'
import { findDsarDetail } from '../../_core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string }>
}

const EvidenceBodySchema = z.object({
  type: z.enum(['CONSENT_RECEIPT', 'EXPORT_FILE', 'DELETION_PROOF', 'OPERATIONAL_NOTE', 'OTHER']),
  filename: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(1).max(120).optional(),
  sizeBytes: z.number().int().min(0).max(50_000_000).optional(),
  hash: z.string().trim().min(16).max(128),
  url: z.string().trim().url().max(1000).optional(),
  note: z.string().trim().max(1000).optional(),
  correlationId: z.string().trim().min(1).max(120).optional(),
})

export async function POST(request: NextRequest, context: RouteContext) {
  let correlationId = crypto.randomUUID()

  try {
    const admin = await requireAdmin()
    const { id } = await context.params
    const body = EvidenceBodySchema.parse(await request.json().catch(() => ({})))
    correlationId = body.correlationId ?? correlationId

    const detail = await findDsarDetail(id)
    if (!detail) {
      return evidenceError('USER_080', 'Solicitacao DSAR nao encontrada.', correlationId, 404)
    }

    const evidence = {
      id: crypto.randomUUID(),
      type: body.type,
      filename: body.filename,
      mimeType: body.mimeType ?? null,
      sizeBytes: body.sizeBytes ?? null,
      hash: body.hash,
      url: body.url ?? null,
      note: body.note ?? null,
    }

    const auditEvent = await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'admin.dsar.evidence_attached',
        resource: 'dsar_request',
        resourceId: id,
        ipAddress: getClientIp(request),
        metadata: {
          requestId: id,
          requestType: detail.type,
          previousStatus: detail.status,
          nextStatus: detail.status,
          correlationId,
          actorId: admin.id,
          evidence,
        },
      },
      select: {
        id: true,
        action: true,
        resource: true,
        resourceId: true,
        createdAt: true,
      },
    })

    return successResponse(
      {
        requestId: id,
        status: detail.status,
        correlationId,
        evidence: {
          ...evidence,
          attachedAt: auditEvent.createdAt.toISOString(),
          auditEventId: auditEvent.id,
          author: {
            userId: admin.id,
            email: admin.email,
          },
        },
        auditEvent,
      },
      201,
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return evidenceError('VALIDATION_ERROR', 'Dados invalidos.', correlationId, 400)
    }
    if (error instanceof AuthError) {
      const authError = error.type === 'UNAUTHORIZED' ? AUTH_001 : AUTH_004
      return evidenceError(authError.code, authError.userMessage, correlationId, authError.httpStatus)
    }
    return evidenceError(SYS_001.code, SYS_001.userMessage, correlationId, SYS_001.httpStatus)
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin()
    const { id } = await context.params
    const detail = await findDsarDetail(id)

    if (!detail) {
      return NextResponse.json(
        {
          error: {
            code: USER_080.code,
            message: 'Solicitacao DSAR nao encontrada.',
          },
        },
        { status: 404 },
      )
    }

    return successResponse({
      requestId: id,
      status: detail.status,
      attachments: detail.evidence.attachments,
      auditLog: detail.evidence.auditEvents,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

function evidenceError(code: string, message: string, correlationId: string, status: number) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        correlationId,
      },
    },
    { status },
  )
}
