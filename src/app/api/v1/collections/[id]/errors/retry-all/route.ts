import { type NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const job = await prisma.collectionJob.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!job) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), { status: 404 })
    return successResponse({ jobId: id, retriedAll: true })
  } catch (error) { return handleApiError(error) }
}
