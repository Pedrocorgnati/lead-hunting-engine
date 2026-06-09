import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, paginatedResponse, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import { isPilotTag, pilotTagsOf, PILOT_TAG_REGEX } from '@/lib/pilot-program'

const ListQuerySchema = z.object({
  // Escopo opcional a um periodo especifico (ex: `pilot-q2-2026`).
  tag: z.string().trim().optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/**
 * GET /api/v1/admin/pilot-program/cohort — Task 56 / C6.
 *
 * Lista o cohort do programa piloto: usuarios com ao menos uma tag `pilot-*`
 * (convencao M14-G-010). Reaproveita `UserProfile.tags` sem duplicar dados.
 * Cada item ja traz contagem de leads, status de onboarding e ultimo NPS para
 * a tela `/admin/programa-piloto` montar a taxonomia admin propria.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const { tag, q, page, limit } = ListQuerySchema.parse(
      Object.fromEntries(searchParams),
    )

    // Candidatos: usuarios com tags. Filtro de prefixo `pilot-` em app
    // (cohort piloto e pequeno por definicao). Quando `tag` e informada,
    // o banco ja restringe via `has`.
    const candidates = await prisma.userProfile.findMany({
      where: {
        ...(tag && isPilotTag(tag) ? { tags: { has: tag } } : { NOT: { tags: { isEmpty: true } } }),
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: 'insensitive' as const } },
                { name: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tags: true,
        onboardingCompletedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const cohort = candidates.filter((u) => pilotTagsOf(u.tags).length > 0)
    const total = cohort.length
    const pageSlice = cohort.slice((page - 1) * limit, page * limit)

    // Enriquecimento derivado (leads + ultimo NPS) apenas da pagina visivel.
    const ids = pageSlice.map((u) => u.id)
    const [leadCounts, lastNps] = await Promise.all([
      ids.length
        ? prisma.lead.groupBy({
            by: ['userId'],
            where: { userId: { in: ids } },
            _count: { _all: true },
          })
        : Promise.resolve([] as { userId: string; _count: { _all: number } }[]),
      ids.length
        ? prisma.npsResponse.findMany({
            where: { userId: { in: ids } },
            orderBy: { submittedAt: 'desc' },
            distinct: ['userId'],
            select: { userId: true, score: true, submittedAt: true },
          })
        : Promise.resolve([] as { userId: string; score: number; submittedAt: Date }[]),
    ])

    const leadByUser = new Map(leadCounts.map((r) => [r.userId, r._count._all]))
    const npsByUser = new Map(lastNps.map((r) => [r.userId, r]))

    const data = pageSlice.map((u) => {
      const nps = npsByUser.get(u.id)
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        pilotTags: pilotTagsOf(u.tags),
        onboardingCompleted: u.onboardingCompletedAt !== null,
        joinedAt: u.createdAt.toISOString(),
        leadsCount: leadByUser.get(u.id) ?? 0,
        lastNpsScore: nps?.score ?? null,
        lastNpsAt: nps?.submittedAt.toISOString() ?? null,
      }
    })

    return paginatedResponse(data, { page, limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}

const AddByEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email invalido.'),
  tag: z
    .string()
    .min(2)
    .max(64)
    .regex(PILOT_TAG_REGEX, 'Tag deve seguir o padrao pilot-{periodo} (ex: pilot-q2-2026).'),
})

/**
 * POST /api/v1/admin/pilot-program/cohort — Task 56 / C6.
 *
 * Adiciona um participante ao cohort piloto resolvendo o usuario por email
 * (a listagem admin de usuarios nao expoe busca por email). Complementa o
 * endpoint por `:userId` usado quando o id ja e conhecido. Idempotente.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const { email, tag } = AddByEmailSchema.parse(await request.json())

    const user = await prisma.userProfile.findUnique({
      where: { email },
      select: { id: true, email: true, tags: true },
    })
    if (!user) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Nenhum usuario com esse email.' } },
        { status: 404 },
      )
    }

    if (user.tags.includes(tag)) {
      return successResponse({ id: user.id, pilotTags: pilotTagsOf(user.tags), changed: false })
    }

    const tags = Array.from(new Set([...user.tags, tag])).sort()
    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: { tags },
      select: { id: true, email: true, tags: true },
    })

    await AuditService.log({
      userId: admin.id,
      action: 'pilot.cohort_added',
      resource: 'user_profile',
      resourceId: user.id,
      metadata: { tag, targetEmail: updated.email },
    })

    return successResponse(
      { id: updated.id, pilotTags: pilotTagsOf(updated.tags), changed: true },
      201,
    )
  } catch (error) {
    return handleApiError(error)
  }
}
