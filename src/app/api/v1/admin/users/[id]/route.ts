import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'

const BodySchema = z.object({
  active: z.boolean(),
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
        { error: { code: 'AUTH_004', message: 'Admin não pode desativar a si mesmo.' } },
        { status: 403 },
      )
    }

    const body = BodySchema.parse(await request.json())

    const user = await prisma.userProfile.update({
      where: { id },
      data: { deactivatedAt: body.active ? null : new Date() },
      select: { id: true, email: true, deactivatedAt: true },
    })

    await AuditService.log({
      userId: admin.id,
      action: body.active ? 'user.reactivated' : 'user.deactivated',
      resource: 'user_profile',
      resourceId: id,
      metadata: { targetEmail: user.email },
    })

    return successResponse(user)
  } catch (error) {
    return handleApiError(error)
  }
}
