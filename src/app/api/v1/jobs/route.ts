import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { jobService } from '@/services/job.service'
import { CreateJobSchema } from '@/schemas/job.schema'
import { errorResponse, JOB_050 } from '@/constants/errors'

const MAX_CONCURRENT_JOBS = 3

export async function GET() {
  try {
    const user = await requireAuth()
    const jobs = await jobService.findAllByUser(user.id)
    return successResponse(jobs)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const validated = CreateJobSchema.parse(body)

    const concurrent = await jobService.countConcurrent(user.id)
    if (concurrent >= MAX_CONCURRENT_JOBS) {
      return NextResponse.json(errorResponse(JOB_050), { status: 429 })
    }

    const job = await jobService.create(validated, user.id)
    return successResponse({ id: job.id, status: job.status }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
