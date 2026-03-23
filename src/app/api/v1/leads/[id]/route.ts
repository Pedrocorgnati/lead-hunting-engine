import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { leadService } from '@/services/lead.service'
import { errorResponse, LEAD_080 } from '@/constants/errors'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lead = await leadService.findById(id, user.id)

    if (!lead) {
      return NextResponse.json(errorResponse(LEAD_080), { status: 404 })
    }

    return successResponse(lead)
  } catch (error) {
    return handleApiError(error)
  }
}
