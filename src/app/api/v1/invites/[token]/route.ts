import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { inviteService } from '@/services/invite.service'
import { errorResponse, INVITE_080 } from '@/constants/errors'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const invite = await inviteService.findByToken(token)

    if (!invite) {
      return NextResponse.json(errorResponse(INVITE_080), { status: 404 })
    }

    return successResponse(invite)
  } catch (error) {
    return handleApiError(error)
  }
}
