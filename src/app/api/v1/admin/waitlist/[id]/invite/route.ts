import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import { inviteService, InviteError } from '@/services/invite.service'

const BodySchema = z.object({
  role: z.enum(['ADMIN', 'OPERATOR']).default('OPERATOR'),
  expiresInDays: z.number().int().min(1).max(30).optional(),
})

/**
 * POST /api/v1/admin/waitlist/[id]/invite — TASK-2/ST005 (CL-495)
 * Transita uma WaitlistEntry PENDING -> INVITED e envia convite via
 * inviteService (reuso do fluxo existente).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params

    const body = await request.json().catch(() => ({}))
    const { role, expiresInDays } = BodySchema.parse(body ?? {})

    const entry = await prisma.waitlistEntry.findUnique({ where: { id } })
    if (!entry) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Entrada de waitlist nao encontrada.' } },
        { status: 404 },
      )
    }

    if (entry.status === 'INVITED') {
      return NextResponse.json(
        {
          error: {
            code: 'WAITLIST_ALREADY_INVITED',
            message: 'Esta entrada ja foi convidada.',
          },
        },
        { status: 409 },
      )
    }

    try {
      const invite = await inviteService.create(
        { email: entry.email, role, expiresInDays: expiresInDays ?? 7 },
        admin.id,
      )

      await prisma.waitlistEntry.update({
        where: { id },
        data: {
          status: 'INVITED',
          invitedAt: new Date(),
          invitedById: admin.id,
        },
      })

      await AuditService.log({
        userId: admin.id,
        action: 'waitlist.invited',
        resource: 'waitlist_entry',
        resourceId: id,
        metadata: { email: entry.email, role, inviteId: invite.id },
      })

      return successResponse({ invite, waitlistEntryId: id }, 201)
    } catch (inviteErr) {
      if (inviteErr instanceof InviteError) {
        return NextResponse.json(
          { error: { code: inviteErr.code, message: inviteErr.message } },
          { status: inviteErr.code === 'INVITE_020' ? 400 : 409 },
        )
      }
      throw inviteErr
    }
  } catch (error) {
    return handleApiError(error)
  }
}
