import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth'
import { auditLog } from '@/lib/services/audit-service'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireSession(req)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
  }

  const job = await prisma.collectionJob.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, organizationId: true },
  })

  if (!job) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  if (job.status !== 'failed_terminal') {
    return NextResponse.json({ error: { code: 'INVALID_STATUS', detail: 'Job is not in failed_terminal state' } }, { status: 409 })
  }

  const updated = await prisma.collectionJob.update({
    where: { id: params.id },
    data: {
      status: 'pending',
      retryCount: 0,
      dlqRequeuedAt: new Date(),
      lastError: null,
    },
    select: { id: true, status: true },
  })

  await auditLog({
    action: 'DLQ_REQUEUED',
    userId: session.user.id,
    resourceId: params.id,
    resourceType: 'CollectionJob',
  })

  return NextResponse.json({ job: updated })
}
