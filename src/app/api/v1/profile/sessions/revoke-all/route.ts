/**
 * TASK-038 (B13): revoga TODAS as sessoes ativas do usuario.
 * POST /api/v1/profile/sessions/revoke-all
 * - Invalida todos os refresh tokens do usuario via Supabase Admin.
 * - Registra AuditLog.
 * - Retorna 200 com forceRelogin=true.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuditService } from '@/lib/services/audit-service'
import { getClientIp } from '@/lib/rate-limiter'

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const ip = getClientIp(request)

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.signOut(user.id, 'global')

    if (error) {
      return NextResponse.json(
        { error: { code: 'AUTH_006', message: error.message } },
        { status: 400 }
      )
    }

    await AuditService.log({
      userId: user.id,
      action: 'session.revoke_all',
      resource: 'auth_session',
      resourceId: user.id,
      metadata: { reason: 'user_initiated' },
      ipAddress: ip,
    })

    return NextResponse.json({
      data: {
        message: 'Todas as sessoes foram encerradas.',
        forceRelogin: true,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
