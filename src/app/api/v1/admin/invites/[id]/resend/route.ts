import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { inviteService } from '@/services/invite.service'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params
    const invite = await inviteService.resend(id)
    return successResponse(invite)
  } catch (error) {
    return handleApiError(error)
  }
}
