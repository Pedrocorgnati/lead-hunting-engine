import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/onboarding/catalog
 * Retorna regiões (UF + cidades) e nichos ativos para alimentar os steps
 * do wizard. Requer apenas usuário autenticado (não ADMIN).
 */
export async function GET() {
  try {
    await requireAuth()

    const [regions, niches] = await Promise.all([
      prisma.region.findMany({
        where: { archived: false },
        select: { id: true, uf: true, name: true, capital: true, cities: true },
        orderBy: { uf: 'asc' },
      }),
      prisma.niche.findMany({
        where: { archived: false },
        select: { id: true, slug: true, label: true },
        orderBy: { label: 'asc' },
      }),
    ])

    return successResponse({ regions, niches })
  } catch (error) {
    return handleApiError(error)
  }
}

export const dynamic = 'force-dynamic'
