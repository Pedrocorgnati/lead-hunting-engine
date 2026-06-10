// Maquinario das mutacoes DSAR (execute-export / execute-deletion / complete),
// extraido de route.ts: o type-check de rotas do Next proibe exports
// nao-handler em route.ts (quebrava o build webpack). Consumido pelos route
// handlers POST de [id]/{complete,execute-deletion,execute-export}.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AuthError, requireAdmin } from '@/lib/auth'
import { successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/rate-limiter'
import { errorResponse, AUTH_001, AUTH_002, AUTH_004, AUTH_006, SYS_001, DSAR_080 } from '@/constants/errors'
import { findDsarDetail, type DsarDetail, type DsarStatus, type DsarType } from '../_core'

interface RouteContext {
  params: Promise<{ id: string }>
}

export type { RouteContext as DsarMutationRouteContext }

const MutationBodySchema = z.object({
  correlationId: z.string().trim().min(1).max(120).optional(),
  confirmationChallenge: z.string().trim().max(160).optional(),
  currentPassword: z.string().min(6).max(200).optional(),
  reason: z.string().trim().max(500).optional(),
})

type DsarMutation = 'execute-export' | 'execute-deletion' | 'complete'

interface MutationConfig {
  action: 'admin.dsar.export_ready' | 'admin.dsar.deletion_executed' | 'admin.dsar.completed'
  destructive: boolean
  nextStatus: DsarStatus
  allowedTypes: DsarType[]
  allowedStatuses: DsarStatus[]
}

const MUTATIONS: Record<DsarMutation, MutationConfig> = {
  'execute-export': {
    action: 'admin.dsar.export_ready',
    destructive: false,
    nextStatus: 'EXPORT_READY',
    allowedTypes: ['EXPORT'],
    allowedStatuses: ['REQUESTED', 'PROCESSING'],
  },
  'execute-deletion': {
    action: 'admin.dsar.deletion_executed',
    destructive: true,
    nextStatus: 'DELETION_EXECUTED',
    allowedTypes: ['DELETION'],
    allowedStatuses: ['REQUESTED', 'PROCESSING'],
  },
  complete: {
    action: 'admin.dsar.completed',
    destructive: false,
    nextStatus: 'COMPLETED',
    allowedTypes: ['EXPORT', 'DELETION'],
    allowedStatuses: ['EXPORT_READY', 'DELETION_EXECUTED'],
  },
}

const ERROR_MESSAGES = {
  invalidType: 'A mutacao DSAR nao se aplica ao tipo desta solicitacao.',
  invalidStatus: 'A solicitacao DSAR nao esta em um estado permitido para esta mutacao.',
  missingConfirmation: 'Confirmacao explicita obrigatoria para mutacao destrutiva.',
  invalidPassword: 'Senha atual invalida para reautenticacao.',
} as const

async function verifyCurrentPassword(email: string, currentPassword: string): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })

  return !error
}

function dsarError(code: string, message: string, correlationId: string, status: number) {
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

function detailWithAppendedStatus(
  detail: DsarDetail,
  status: DsarStatus,
  correlationId: string,
): DsarDetail {
  const now = new Date().toISOString()

  return {
    ...detail,
    status,
    completedAt: status === 'COMPLETED' ? now : detail.completedAt,
    correlationId,
    timeline: [
      ...detail.timeline,
      {
        status,
        action: statusToAction(status),
        at: now,
        auditEventId: detail.requestId,
        correlationId,
      },
    ],
  }
}

function statusToAction(status: DsarStatus): string {
  if (status === 'EXPORT_READY') return 'admin.dsar.export_ready'
  if (status === 'DELETION_EXECUTED') return 'admin.dsar.deletion_executed'
  return 'admin.dsar.completed'
}


export async function executeDsarMutation(
  request: NextRequest,
  context: RouteContext,
  mutation: DsarMutation,
) {
  const config = MUTATIONS[mutation]
  let resolvedCorrelationId = crypto.randomUUID()

  try {
    const admin = await requireAdmin()
    const { id } = await context.params
    const body = MutationBodySchema.parse(await request.json().catch(() => ({})))
    resolvedCorrelationId = body.correlationId ?? resolvedCorrelationId
    const detail = await findDsarDetail(id)

    if (!detail) {
      return dsarError(DSAR_080.code, DSAR_080.userMessage, resolvedCorrelationId, 404)
    }

    if (!config.allowedTypes.includes(detail.type)) {
      return dsarError('DSAR_020', ERROR_MESSAGES.invalidType, resolvedCorrelationId, 409)
    }

    if (!config.allowedStatuses.includes(detail.status)) {
      return dsarError('DSAR_021', ERROR_MESSAGES.invalidStatus, resolvedCorrelationId, 409)
    }

    if (config.destructive) {
      const confirmed = request.headers.get('x-confirm') === 'true'
      const expectedChallenge = `DELETE ${id}`
      if (!confirmed || body.confirmationChallenge !== expectedChallenge || !body.currentPassword) {
        return dsarError(AUTH_006.code, ERROR_MESSAGES.missingConfirmation, resolvedCorrelationId, 401)
      }

      const reauthOk = await verifyCurrentPassword(admin.email, body.currentPassword)
      if (!reauthOk) {
        return dsarError(AUTH_002.code, ERROR_MESSAGES.invalidPassword, resolvedCorrelationId, 401)
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: config.action,
          resource: 'dsar_request',
          resourceId: id,
          ipAddress: getClientIp(request),
          metadata: {
            requestId: id,
            requestType: detail.type,
            previousStatus: detail.status,
            nextStatus: config.nextStatus,
            correlationId: resolvedCorrelationId,
            reason: body.reason ?? null,
            actorId: admin.id,
          },
        },
      })

      if (mutation === 'execute-deletion' && detail.subject.userId) {
        await tx.userProfile.update({
          where: { id: detail.subject.userId },
          data: { deactivatedAt: new Date() },
        })
      }
    })

    const updated = await findDsarDetail(id)

    return successResponse({
      requestId: id,
      type: detail.type,
      previousStatus: detail.status,
      status: config.nextStatus,
      correlationId: resolvedCorrelationId,
      request: updated ?? detailWithAppendedStatus(detail, config.nextStatus, resolvedCorrelationId),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return dsarError('VALIDATION_ERROR', 'Dados invalidos.', resolvedCorrelationId, 400)
    }
    if (error instanceof AuthError) {
      const authError = error.type === 'UNAUTHORIZED' ? AUTH_001 : AUTH_004
      return dsarError(authError.code, authError.userMessage, resolvedCorrelationId, authError.httpStatus)
    }
    return dsarError(SYS_001.code, SYS_001.userMessage, resolvedCorrelationId, SYS_001.httpStatus)
  }
}
