import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

const CompareQuerySchema = z.object({
  ids: z.string().min(1),
})

const MAX_COMPARE = 4

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const raw = CompareQuerySchema.parse(Object.fromEntries(searchParams))

    const ids = raw.ids.split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length < 2) {
      return NextResponse.json(
        { error: { code: 'COMPARE_001', message: 'Informe pelo menos 2 leads para comparar.' } },
        { status: 400 },
      )
    }
    if (ids.length > MAX_COMPARE) {
      return NextResponse.json(
        { error: { code: 'COMPARE_002', message: `Limite maximo de ${MAX_COMPARE} leads por comparacao.` } },
        { status: 400 },
      )
    }

    const leads = await prisma.lead.findMany({
      where: {
        userId: user.id,
        id: { in: ids },
      },
      select: {
        id: true,
        businessName: true,
        score: true,
        status: true,
        city: true,
        state: true,
        category: true,
        website: true,
        phone: true,
        email: true,
        temperature: true,
        opportunities: true,
        rating: true,
        reviewCount: true,
        instagramFollowers: true,
        facebookFollowers: true,
        uxScore: true,
        createdAt: true,
        updatedAt: true,
        job: {
          select: {
            currentSource: true,
          },
        },
      },
    })

    // Ordenar na mesma sequencia dos ids solicitados
    const ordered = ids
      .map((id) => leads.find((l) => l.id === id))
      .filter((l): l is NonNullable<typeof l> => l !== undefined)
      .map((l) => ({
        ...l,
        source: l.job?.currentSource ?? undefined,
        job: undefined,
      }))

    return successResponse({ leads: ordered })
  } catch (error) {
    return handleApiError(error)
  }
}
