import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { UpdateNicheSchema } from '@/schemas/config.schema'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const data = UpdateNicheSchema.parse(await request.json())
    const niche = await prisma.niche.update({ where: { id }, data })
    return successResponse(niche)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const niche = await prisma.niche.update({
      where: { id },
      data: { archived: true },
    })
    return successResponse(niche)
  } catch (error) {
    return handleApiError(error)
  }
}
