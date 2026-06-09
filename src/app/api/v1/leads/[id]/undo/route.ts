import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { consumeUndoSnapshot } from '@/lib/leads/undo-store'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const user = await requireAuth()

  const body = await req.json().catch(() => ({}))
  const { undoToken } = body as { undoToken?: string }

  if (!undoToken) {
    return NextResponse.json({ error: { code: 'MISSING_TOKEN' } }, { status: 400 })
  }

  const snapshot = await consumeUndoSnapshot(id, undoToken)
  if (!snapshot) {
    return NextResponse.json({ error: { code: 'TOKEN_EXPIRED_OR_INVALID' } }, { status: 410 })
  }

  if (snapshot.action === 'delete-tag') {
    await prisma.leadTag.create({
      data: {
        leadId: id,
        ...(snapshot.snapshot as Record<string, unknown>),
      } as any,
    })
  } else {
    return NextResponse.json({ error: { code: 'UNKNOWN_ACTION' } }, { status: 400 })
  }

  return NextResponse.json({ ok: true, restored: snapshot.action })
}
