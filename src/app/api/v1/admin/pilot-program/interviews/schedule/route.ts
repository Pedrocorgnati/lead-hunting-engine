import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import { pilotTagsOf } from '@/lib/pilot-program'

const ScheduleSchema = z.object({
  userId: z.string().uuid('userId invalido.'),
  scheduledFor: z
    .string()
    .datetime({ message: 'scheduledFor deve ser ISO 8601.' }),
  channel: z.enum(['video', 'phone', 'in_person']).default('video'),
  notes: z.string().trim().max(500).optional(),
})

const CHANNEL_LABEL: Record<z.infer<typeof ScheduleSchema>['channel'], string> = {
  video: 'videochamada',
  phone: 'telefone',
  in_person: 'presencial',
}

/**
 * POST /api/v1/admin/pilot-program/interviews/schedule — Task 56 / C6.
 *
 * Agenda uma entrevista de piloto criando uma `Notification` para o
 * participante (reuso do canal de notificacoes, sem tabela nova) e registrando
 * o agendamento no audit log. So aceita usuarios que ja estao no cohort piloto.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const { userId, scheduledFor, channel, notes } = ScheduleSchema.parse(
      await request.json(),
    )

    const user = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, tags: true },
    })
    if (!user) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Usuario nao encontrado.' } },
        { status: 404 },
      )
    }

    const pilotTags = pilotTagsOf(user.tags)
    if (pilotTags.length === 0) {
      return Response.json(
        {
          error: {
            code: 'PILOT_NOT_IN_COHORT',
            message: 'Usuario nao faz parte do cohort piloto. Adicione-o antes de agendar.',
          },
        },
        { status: 409 },
      )
    }

    const when = new Date(scheduledFor)
    const channelLabel = CHANNEL_LABEL[channel]

    const notification = await prisma.notification.create({
      data: {
        userId,
        type: 'pilot_interview',
        title: 'Entrevista do programa piloto agendada',
        message: `Sua entrevista (${channelLabel}) foi agendada para ${when.toLocaleString('pt-BR')}.${
          notes ? ` Observacao: ${notes}` : ''
        }`,
        data: {
          scheduledFor: when.toISOString(),
          channel,
          notes: notes ?? null,
          scheduledBy: admin.id,
        },
      },
      select: { id: true, createdAt: true },
    })

    await AuditService.log({
      userId: admin.id,
      action: 'pilot.interview_scheduled',
      resource: 'user_profile',
      resourceId: userId,
      metadata: {
        targetEmail: user.email,
        scheduledFor: when.toISOString(),
        channel,
        notificationId: notification.id,
      },
    })

    return successResponse(
      {
        notificationId: notification.id,
        userId,
        scheduledFor: when.toISOString(),
        channel,
      },
      201,
    )
  } catch (error) {
    return handleApiError(error)
  }
}
