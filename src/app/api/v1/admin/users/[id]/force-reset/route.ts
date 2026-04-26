import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatch } from '@/lib/notifications/dispatcher'
import { getClientIp } from '@/lib/rate-limiter'

const BodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
})

/**
 * POST /api/v1/admin/users/[id]/force-reset
 * -----------------------------------------
 * TASK-7 (CL-473): admin obriga usuario a trocar de senha na proxima sessao.
 *
 * Fluxo:
 *   1. Marca UserProfile.mustResetPassword = true
 *   2. Deriva um magic-link de recovery via Supabase admin.generateLink
 *   3. Invalida sessoes ativas (global signOut) — usuario sera deslogado imediatamente
 *   4. Dispatch do evento PASSWORD_RESET_FORCED para notificar o alvo
 *   5. AuditLog registra actor, alvo e reason
 *
 * Seguranca:
 *   - RBAC: ADMIN
 *   - Self-block: admin nao pode forcar reset da propria conta por aqui
 *   - Nao devolve o link gerado na resposta (evita logging/telemetria pegar)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    const { id: targetId } = await params

    if (targetId === admin.id) {
      return NextResponse.json(
        {
          error: {
            code: 'AUTH_004',
            message: 'Use o fluxo padrao de troca de senha para a propria conta.',
          },
        },
        { status: 403 }
      )
    }

    const target = await prisma.userProfile.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, name: true, deactivatedAt: true },
    })
    if (!target) {
      return NextResponse.json(
        { error: { code: 'USER_080', message: 'Usuario nao encontrado.' } },
        { status: 404 }
      )
    }
    if (target.deactivatedAt) {
      return NextResponse.json(
        {
          error: {
            code: 'USER_081',
            message: 'Usuario desativado nao pode receber force-reset.',
          },
        },
        { status: 409 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { reason } = BodySchema.parse(body ?? {})

    const supabaseAdmin = createAdminClient()

    // Gera link de recovery — mesmo que o email ja tenha falhado, usuario
    // sera redirecionado para /update-password pela flag em middleware.
    let generatedLink = false
    try {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: target.email,
      })
      generatedLink = !error && Boolean(data)
    } catch {
      generatedLink = false
    }

    // Invalida sessoes ativas imediatamente (alvo nao pode continuar navegando)
    let signOutOk = true
    try {
      const { error: signOutErr } = await supabaseAdmin.auth.admin.signOut(
        targetId,
        'global'
      )
      signOutOk = !signOutErr
    } catch {
      signOutOk = false
    }

    await prisma.userProfile.update({
      where: { id: targetId },
      data: { mustResetPassword: true },
    })

    await AuditService.log({
      userId: admin.id,
      action: 'admin.force_password_reset',
      resource: 'user_profile',
      resourceId: targetId,
      metadata: {
        targetEmail: target.email,
        reason: reason ?? null,
        generatedLink,
        signOutOk,
      },
      ipAddress: getClientIp(request),
    })

    await dispatch({
      event: 'PASSWORD_RESET_FORCED',
      userId: targetId,
      params: { reason: reason ?? null },
      data: { forcedByAdminId: admin.id, reason: reason ?? null },
    }).catch(() => undefined)

    return successResponse({
      targetId,
      email: target.email,
      generatedLink,
      signOutOk,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
