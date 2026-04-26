import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { jobService } from '@/services/job.service'
import { CreateJobSchema } from '@/schemas/job.schema'
import { limits } from '@/lib/rate-limiter'

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
    limits.createJob(user.id)

    const body = await request.json()
    const validated = CreateJobSchema.parse(body)

    // jobService.create delega quota (concurrent + monthly) ao quotaEnforcer
    // e lanca QuotaExceededError quando excedido. handleApiError converte
    // para 429 com code JOB_050 (concurrent) ou JOB_053 (monthly).
    const job = await jobService.create(validated, user.id)
    return successResponse({ id: job.id, status: job.status }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
