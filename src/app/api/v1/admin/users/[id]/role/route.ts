import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'

const BodySchema = z.object({
  role: z.enum(['ADMIN', 'OPERATOR']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params

    if (request.headers.get('x-confirm') !== 'true') {
      return Response.json(
        { error: { code: 'AUTH_006', message: 'Confirmação explícita obrigatória (header x-confirm: true).' } },
        { status: 401 },
      )
    }

    if (id === admin.id) {
      return Response.json(
        { error: { code: 'AUTH_004', message: 'Admin não pode alterar a própria role.' } },
        { status: 403 },
      )
    }

    const body = BodySchema.parse(await request.json())

    const user = await prisma.userProfile.update({
      where: { id },
      data: { role: body.role },
      select: { id: true, email: true, role: true },
    })

    await AuditService.log({
      userId: admin.id,
      action: 'user.role_changed',
      resource: 'user_profile',
      resourceId: id,
      metadata: { newRole: body.role, targetEmail: user.email },
    })

    return successResponse(user)
  } catch (error) {
    return handleApiError(error)
  }
}
