import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { errorResponse, LEAD_080 } from '@/constants/errors'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/v1/leads/[id]/competitors
 * Retorna top 5 leads no mesmo niche + cidade, com score proximo.
 * TASK-5 intake-review (CL-080).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const whereOwnership =
      user.role === 'ADMIN' ? { id } : { id, userId: user.id }

    const lead = await prisma.lead.findFirst({
      where: whereOwnership,
      select: {
        id: true,
        userId: true,
        niche: true,
        category: true,
        city: true,
        score: true,
      },
    })
    if (!lead) {
      return NextResponse.json(errorResponse(LEAD_080), { status: 404 })
    }

    // Criterio: mesmo niche (fallback category) + mesma city + mesmo owner
    const nicheFilter = lead.niche ?? lead.category
    const where: Prisma.LeadWhereInput = {
      id: { not: lead.id },
      userId: lead.userId,
      ...(nicheFilter
        ? {
            OR: [
              { niche: nicheFilter },
              { category: nicheFilter },
            ],
          }
        : {}),
      ...(lead.city ? { city: lead.city } : {}),
    }

    const candidates = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        businessName: true,
        city: true,
        state: true,
        niche: true,
        category: true,
        score: true,
        temperature: true,
        reviewCount: true,
        rating: true,
        siteAudit: true,
        googleReviews: true,
        techStack: true,
        adsStatus: true,
      },
      take: 20,
    })

    // Ordena por proximidade de score (abs diff) e trunca em 5
    const baseScore = lead.score
    const competitors = candidates
      .map((c) => ({ ...c, distance: Math.abs(c.score - baseScore) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
      .map(({ distance, ...rest }) => {
        void distance
        return rest
      })

    return successResponse({
      baseLead: {
        id: lead.id,
        score: lead.score,
        niche: nicheFilter,
        city: lead.city,
      },
      competitors,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
