import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'

const BodySchema = z.object({
  tags: z.array(z.string().min(1).max(50)).max(20),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params

    if (id === admin.id) {
      return Response.json(
        { error: { code: 'AUTH_005', message: 'Admin não pode alterar próprias tags de cohort.' } },
        { status: 403 },
      )
    }

    const body = BodySchema.parse(await request.json())

    const user = await prisma.userProfile.update({
      where: { id },
      data: { tags: body.tags },
      select: { id: true, email: true, name: true, tags: true },
    })

    await AuditService.log({
      userId: admin.id,
      action: 'user.tags_updated',
      resource: 'user_profile',
      resourceId: id,
      metadata: {
        targetEmail: user.email,
        tags: body.tags.join(','),
      },
    })

    return successResponse(user)
  } catch (error) {
    return handleApiError(error)
  }
}
