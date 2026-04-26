import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { UpdateAccountLimitsSchema } from '@/schemas/config.schema'

/**
 * GET /api/v1/admin/config/limits
 * Retorna os limites da conta do admin autenticado.
 */
export async function GET() {
  try {
    const user = await requireAdmin()
    const profile = await prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { leadsPerMonthMax: true, maxConcurrentJobs: true },
    })
    return successResponse(profile ?? { leadsPerMonthMax: 500, maxConcurrentJobs: 3 })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/v1/admin/config/limits
 * Atualiza limites da conta do admin autenticado.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const data = UpdateAccountLimitsSchema.parse(await request.json())
    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data,
      select: { leadsPerMonthMax: true, maxConcurrentJobs: true },
    })
    return successResponse(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
