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
 * POST /api/v1/admin/users/[id]/invalidate-sessions
 * ------------------------------------------------
 * TASK-4/ST002 (CL-474): admin derruba todas as sessoes ativas de um usuario.
 *
 * Regras:
 *  - Requer role ADMIN
 *  - admin !== alvo (bloqueio self-destruct)
 *  - Registra AuditLog
 *  - Dispara notificacao SESSIONS_REVOKED_BY_ADMIN ao alvo (in-app sempre)
 *  - Nao deixa de logar a intencao se o signOut falhar — seguranca antes de UX
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { id: targetId } = await params

    if (targetId === admin.id) {
      return NextResponse.json(
        {
          error: {
            code: 'AUTH_004',
            message: 'Admin nao pode encerrar as proprias sessoes por aqui. Use logout.',
          },
        },
        { status: 403 },
      )
    }

    const target = await prisma.userProfile.findUnique({
      where: { id: targetId },
      select: { id: true, email: true },
    })
    if (!target) {
      return NextResponse.json(
        { error: { code: 'USER_080', message: 'Usuario nao encontrado.' } },
        { status: 404 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const { reason } = BodySchema.parse(body ?? {})

    // signOut global — invalida todos os refresh tokens do alvo
    let signOutOk = true
    try {
      const supabaseAdmin = createAdminClient()
      const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(
        targetId,
        'global',
      )
      if (signOutError) {
        signOutOk = false
        if (process.env.NODE_ENV !== 'production') {
          console.error('[invalidate-sessions] signOut error:', signOutError)
        }
      }
    } catch (e) {
      signOutOk = false
      if (process.env.NODE_ENV !== 'production') {
        console.error('[invalidate-sessions] signOut exception:', e)
      }
    }

    await AuditService.log({
      userId: admin.id,
      action: 'session.invalidated_by_admin',
      resource: 'auth_session',
      resourceId: targetId,
      metadata: {
        targetEmail: target.email,
        reason: reason ?? null,
        signOutOk,
      },
      ipAddress: getClientIp(request),
    })

    // Notifica o alvo — in-app e canais configurados
    await dispatch({
      event: 'SESSIONS_REVOKED_BY_ADMIN',
      userId: targetId,
      params: { reason: reason ?? null },
      data: { revokedByAdminId: admin.id, reason: reason ?? null },
    })

    return successResponse({
      targetId,
      email: target.email,
      signOutOk,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
