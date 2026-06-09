import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import { PILOT_TAG_REGEX, pilotTagsOf } from '@/lib/pilot-program'

const TagSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(PILOT_TAG_REGEX, 'Tag deve seguir o padrao pilot-{periodo} (ex: pilot-q2-2026).')

const MutateSchema = z.object({ tag: TagSchema })

async function loadUser(id: string) {
  return prisma.userProfile.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, tags: true },
  })
}

/**
 * POST /api/v1/admin/pilot-program/cohort/[userId] — Task 56 / C6.
 * Adiciona o usuario ao cohort piloto inserindo a tag `pilot-{periodo}`.
 * Reaproveita `UserProfile.tags` (M14-G-010), nao cria tabela paralela.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { userId } = await params
    const { tag } = MutateSchema.parse(await request.json())

    const user = await loadUser(userId)
    if (!user) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Usuario nao encontrado.' } },
        { status: 404 },
      )
    }

    if (user.tags.includes(tag)) {
      // Idempotente: ja esta no cohort com essa tag.
      return successResponse({ id: user.id, pilotTags: pilotTagsOf(user.tags), changed: false })
    }

    const tags = Array.from(new Set([...user.tags, tag])).sort()
    const updated = await prisma.userProfile.update({
      where: { id: userId },
      data: { tags },
      select: { id: true, email: true, tags: true },
    })

    await AuditService.log({
      userId: admin.id,
      action: 'pilot.cohort_added',
      resource: 'user_profile',
      resourceId: userId,
      metadata: { tag, targetEmail: updated.email },
    })

    return successResponse({ id: updated.id, pilotTags: pilotTagsOf(updated.tags), changed: true })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/v1/admin/pilot-program/cohort/[userId]?tag=pilot-... — Task 56 / C6.
 * Remove a tag de piloto informada (saida do cohort para aquele periodo).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { userId } = await params
    const { searchParams } = new URL(request.url)
    const { tag } = MutateSchema.parse({ tag: searchParams.get('tag') ?? '' })

    const user = await loadUser(userId)
    if (!user) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Usuario nao encontrado.' } },
        { status: 404 },
      )
    }

    if (!user.tags.includes(tag)) {
      // Idempotente: nao estava no cohort com essa tag.
      return successResponse({ id: user.id, pilotTags: pilotTagsOf(user.tags), changed: false })
    }

    const tags = user.tags.filter((t) => t !== tag)
    const updated = await prisma.userProfile.update({
      where: { id: userId },
      data: { tags },
      select: { id: true, email: true, tags: true },
    })

    await AuditService.log({
      userId: admin.id,
      action: 'pilot.cohort_removed',
      resource: 'user_profile',
      resourceId: userId,
      metadata: { tag, targetEmail: updated.email },
    })

    return successResponse({ id: updated.id, pilotTags: pilotTagsOf(updated.tags), changed: true })
  } catch (error) {
    return handleApiError(error)
  }
}
