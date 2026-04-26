/**
 * TASK-16/ST004 (CL-267): delete de SavedView.
 * DELETE /api/v1/views/[id] -> 204 se pertence ao usuario, 404 caso contrario.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const res = await prisma.savedView.deleteMany({
      where: { id, userId: user.id },
    })
    if (res.count === 0) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Visão não encontrada.' } }, { status: 404 })
    }
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
