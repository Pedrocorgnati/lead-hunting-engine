import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
    if (q.length < 2) return successResponse([])

    const contains = { contains: q, mode: 'insensitive' as const }

    const [leads, jobs, templates] = await Promise.all([
      prisma.lead.findMany({
        where: { userId: user.id, OR: [{ businessName: contains }, { city: contains }, { category: contains }] },
        take: 5,
        select: { id: true, businessName: true, city: true },
      }),
      prisma.collectionJob.findMany({
        where: { userId: user.id, OR: [{ niche: contains }, { city: contains }, { name: contains }] },
        take: 5,
        select: { id: true, niche: true, city: true, status: true },
      }),
      prisma.pitchTemplate.findMany({
        where: { userId: user.id, OR: [{ name: contains }, { content: contains }] },
        take: 5,
        select: { id: true, name: true, tone: true },
      }),
    ])

    const results = [
      ...leads.map((l) => ({
        id: l.id,
        title: l.businessName,
        subtitle: l.city ?? '',
        href: `/leads/${l.id}`,
        kind: 'lead' as const,
      })),
      ...jobs.map((j) => ({
        id: j.id,
        title: `${j.niche} · ${j.city}`,
        subtitle: j.status,
        href: `/coletas/${j.id}`,
        kind: 'job' as const,
      })),
      ...templates.map((t) => ({
        id: t.id,
        title: t.name,
        subtitle: t.tone,
        href: `/settings/pitch-templates`,
        kind: 'template' as const,
      })),
    ]

    return successResponse(results)
  } catch (error) {
    return handleApiError(error)
  }
}
