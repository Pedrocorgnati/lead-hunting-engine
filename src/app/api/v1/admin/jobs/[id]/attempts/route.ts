import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import {
  getJobCorrelationId,
  getRequestCorrelationId,
  JobIdSchema,
  notFoundResponse,
  readAdminJob,
  serializeJobAttempts,
} from '../admin-job-detail'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id: rawId } = await params
    const id = JobIdSchema.parse(rawId)
    const job = await readAdminJob(id)

    if (!job) return notFoundResponse()

    const correlationId = getJobCorrelationId(job, getRequestCorrelationId(request))
    return successResponse(serializeJobAttempts(job, correlationId))
  } catch (error) {
    return handleApiError(error)
  }
}
