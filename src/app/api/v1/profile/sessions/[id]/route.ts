/**
 * TASK-17 intake-review (CL-468): revoga UMA sessao especifica.
 * DELETE /api/v1/profile/sessions/[id]
 * - 409 se tentar revogar a sessao atual.
 * - 204 em sucesso + AuditLog.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { listUserSessions, revokeSession } from '@/lib/supabase/sessions'
import { AuditService } from '@/lib/services/audit-service'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const currentUa = request.headers.get('user-agent')
    const currentIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      undefined

    const sessions = await listUserSessions(user.id)
    const target = sessions.find((s) => s.id === id)
    if (!target) {
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_FOUND', message: 'Sessão não encontrada ou já expirada.' } },
        { status: 404 },
      )
    }

    const isCurrent = Boolean(
      currentUa && currentIp && target.userAgent === currentUa && target.ip === currentIp,
    )
    if (isCurrent) {
      return NextResponse.json(
        {
          error: {
            code: 'CANNOT_REVOKE_CURRENT',
            message: 'Você não pode encerrar a sessão atual. Use "Sair" para isso.',
          },
        },
        { status: 409 },
      )
    }

    await revokeSession(user.id, id)

    await AuditService.log({
      userId: user.id,
      action: 'session.invalidated_by_password_change',
      resource: 'auth_session',
      resourceId: id,
      metadata: { self_revoked: true, userAgent: target.userAgent ?? null },
      ipAddress: currentIp,
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
