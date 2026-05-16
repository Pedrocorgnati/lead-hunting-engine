import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await requireSession(req)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
  const provider = searchParams.get('provider') ?? undefined
  const since = searchParams.get('since') ?? undefined
  const until = searchParams.get('until') ?? undefined

  const where: Record<string, unknown> = { status: 'failed_terminal' }
  if (provider) where.provider = provider
  if (since || until) {
    where.failedAt = {}
    if (since) (where.failedAt as Record<string, unknown>).gte = new Date(since)
    if (until) (where.failedAt as Record<string, unknown>).lte = new Date(until)
  }

  const [items, total] = await Promise.all([
    prisma.collectionJob.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { failedAt: 'desc' },
      select: {
        id: true,
        provider: true,
        lastError: true,
        failedAt: true,
        retryCount: true,
        status: true,
      },
    }),
    prisma.collectionJob.count({ where }),
  ])

  return NextResponse.json({ items, total, page, limit })
}
