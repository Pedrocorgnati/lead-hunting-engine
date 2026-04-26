import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { CreateRegionSchema } from '@/schemas/config.schema'

/**
 * GET /api/v1/admin/config/regions
 * Lista todas as regiões (incluindo arquivadas). RBAC: ADMIN.
 */
export async function GET() {
  try {
    await requireAdmin()
    const regions = await prisma.region.findMany({ orderBy: { uf: 'asc' } })
    return successResponse(regions)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/v1/admin/config/regions
 * Cria nova região.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = await request.json()
    const data = CreateRegionSchema.parse(body)
    const region = await prisma.region.create({ data })
    return successResponse(region, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
