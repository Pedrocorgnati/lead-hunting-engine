import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

const RADAR_WINDOW_HOURS = 24
const RADAR_MAX_RESULTS = 200

/**
 * GET /api/v1/radar
 *
 * Lista leads do usuario descobertos nas ultimas 24h, ordenados por score desc.
 * Usado pela tela /radar (CL-115, CL-116, CL-174).
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth()
    const since = new Date(Date.now() - RADAR_WINDOW_HOURS * 60 * 60 * 1000)

    const leads = await prisma.lead.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: since },
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: RADAR_MAX_RESULTS,
      select: {
        id: true,
        businessName: true,
        category: true,
        city: true,
        state: true,
        phone: true,
        website: true,
        score: true,
        temperature: true,
        opportunities: true,
        status: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      data: leads.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
      meta: {
        windowHours: RADAR_WINDOW_HOURS,
        since: since.toISOString(),
        total: leads.length,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
