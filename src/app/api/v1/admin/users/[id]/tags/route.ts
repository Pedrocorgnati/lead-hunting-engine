import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'

/**
 * M14-G-010: gerencia tags do usuario (cohort piloto).
 *
 * Tags sao livres mas convencionadas: `pilot-{periodo}` (ex: `pilot-q2-2026`).
 * Usadas para segmentar metricas em /admin/metrics.
 */

const TagSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'Tag deve conter apenas a-z, 0-9 e hifen.')

const BodySchema = z.object({
  tags: z.array(TagSchema).max(20),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params

    const parsed = BodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return Response.json(
        {
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Tags invalidas',
            issues: parsed.error.issues,
          },
        },
        { status: 400 },
      )
    }

    const tags = Array.from(new Set(parsed.data.tags)).sort()

    const user = await prisma.userProfile.update({
      where: { id },
      data: { tags },
      select: { id: true, email: true, tags: true },
    })

    await AuditService.log({
      userId: admin.id,
      action: 'user.tags_updated',
      resource: 'user_profile',
      resourceId: id,
      metadata: { tags: tags.join(','), targetEmail: user.email },
    })

    return successResponse(user)
  } catch (error) {
    return handleApiError(error)
  }
}
