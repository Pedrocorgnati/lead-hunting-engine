import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { jobService } from '@/services/job.service'
import { errorResponse, JOB_080 } from '@/constants/errors'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const status = await jobService.getStatus(id, user.id)

    if (!status) {
      return NextResponse.json(errorResponse(JOB_080), { status: 404 })
    }

    return successResponse(status)
  } catch (error) {
    return handleApiError(error)
  }
}
