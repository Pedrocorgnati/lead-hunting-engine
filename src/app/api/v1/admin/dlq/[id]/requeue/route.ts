import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { AuditService } from '@/lib/services/audit-service'
import { Prisma } from '@prisma/client'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const user = await requireAdmin()

  const job = await prisma.collectionJob.findUnique({
    where: { id },
    select: { id: true, status: true },
  })

  if (!job) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  if (job.status !== 'FAILED_TERMINAL') {
    return NextResponse.json({ error: { code: 'INVALID_STATUS', detail: 'Job is not in failed_terminal state' } }, { status: 409 })
  }

  const updated = await prisma.collectionJob.update({
    where: { id },
    data: {
      status: 'PENDING',
      errorMessage: null,
      errorLog: Prisma.JsonNull,
    },
    select: { id: true, status: true },
  })

  await AuditService.log({
    action: 'job.retried',
    userId: user.id,
    resourceId: id,
    resource: 'CollectionJob',
  })

  return NextResponse.json({ job: updated })
}
