import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { cancelJob } from '@/actions/jobs'
import { errorResponse, JOB_080 } from '@/constants/errors'
import { prisma } from '@/lib/prisma'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const job = await prisma.collectionJob.findUnique({
      where: { id },
      select: { userId: true },
    })
    if (!job || job.userId !== user.id) {
      return NextResponse.json(errorResponse(JOB_080), { status: 404 })
    }

    await cancelJob(id)
    return successResponse({ cancelled: true })
  } catch (error) {
    return handleApiError(error)
  }
}
