import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

const QuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) })

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const { searchParams } = request.nextUrl
    const { limit } = QuerySchema.parse(Object.fromEntries(searchParams))

    const job = await prisma.collectionJob.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })
    if (!job) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), { status: 404 })

    const logs = await prisma.auditLog.findMany({
      where: { resource: 'collection_job', resourceId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, action: true, metadata: true, ipAddress: true, createdAt: true },
    })

    return successResponse({ logs, total: logs.length })
  } catch (error) { return handleApiError(error) }
}
