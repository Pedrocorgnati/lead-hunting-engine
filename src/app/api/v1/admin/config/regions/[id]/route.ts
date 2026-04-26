import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { UpdateRegionSchema } from '@/schemas/config.schema'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const data = UpdateRegionSchema.parse(await request.json())
    const region = await prisma.region.update({ where: { id }, data })
    return successResponse(region)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE = soft delete (archived=true) — preserva FK de CollectionJob históricos.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const region = await prisma.region.update({
      where: { id },
      data: { archived: true },
    })
    return successResponse(region)
  } catch (error) {
    return handleApiError(error)
  }
}
