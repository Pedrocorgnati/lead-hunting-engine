/**
 * TASK-17 intake-review (CL-042): lista sessoes ativas do usuario logado.
 * GET /api/v1/profile/sessions -> [{id, createdAt, lastActiveAt, userAgent, ip, isCurrent}]
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { listUserSessions } from '@/lib/supabase/sessions'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const sessions = await listUserSessions(user.id)

    const currentUa = request.headers.get('user-agent')
    const currentIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip')

    const enriched = sessions.map((s) => ({
      ...s,
      isCurrent: Boolean(currentUa && currentIp && s.userAgent === currentUa && s.ip === currentIp),
    }))

    return successResponse({ sessions: enriched })
  } catch (error) {
    return handleApiError(error)
  }
}
