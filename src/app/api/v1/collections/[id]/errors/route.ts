import { type NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { buildErrorList } from './_errors-mapper'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const job = await prisma.collectionJob.findFirst({
      where: { id, userId: user.id },
      select: { id: true, errorLog: true, errorMessage: true },
    })
    if (!job) {
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Coleta nao encontrada.' } }), { status: 404 })
    }

    const all = buildErrorList(id, job.errorLog, job.errorMessage)
    // Ordenacao default: timestamp DESC (nulos por ultimo).
    all.sort((a, b) => {
      if (a.timestamp === b.timestamp) return 0
      if (a.timestamp === null) return 1
      if (b.timestamp === null) return -1
      return a.timestamp < b.timestamp ? 1 : -1
    })

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    )
    const start = (page - 1) * limit
    const errors = all.slice(start, start + limit)

    return successResponse({ errors, total: all.length, page, limit })
  } catch (error) {
    return handleApiError(error)
  }
}
