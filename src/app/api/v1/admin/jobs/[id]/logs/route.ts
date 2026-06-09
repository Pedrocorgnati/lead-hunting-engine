import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import {
  getJobCorrelationId,
  getRequestCorrelationId,
  JobIdSchema,
  LogsQuerySchema,
  notFoundResponse,
  readAdminJob,
  serializeJobLogs,
} from '../admin-job-detail'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id: rawId } = await params
    const id = JobIdSchema.parse(rawId)
    const { searchParams } = new URL(request.url)
    const query = LogsQuerySchema.parse(Object.fromEntries(searchParams))
    const job = await readAdminJob(id)

    if (!job) return notFoundResponse()

    const correlationId = getJobCorrelationId(job, getRequestCorrelationId(request))
    return successResponse(await serializeJobLogs(job, correlationId, query.limit))
  } catch (error) {
    return handleApiError(error)
  }
}
