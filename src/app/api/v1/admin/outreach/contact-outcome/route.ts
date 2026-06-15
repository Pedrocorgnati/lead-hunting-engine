/**
 * POST /api/v1/admin/outreach/contact-outcome
 *
 * Registra o DESFECHO de um contato direto (WhatsApp/telefone) feito pelo
 * operador. Reusa `applyOutcome` (ContactEvent + transição guardada de
 * Lead.status) — a mesma máquina do canal de e-mail. Opt-out vira supressão por
 * telefone (LGPD: "não perturbe" trivial e respeitado).
 *
 * Multi-tenant: o lead precisa ser do próprio operador.
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { applyOutcome } from '@/lib/outreach/lead-status-bridge'
import { addSuppression } from '@/lib/outreach/suppression'

const BodySchema = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(['WHATSAPP', 'TELEFONE']),
  outcome: z.enum(['SENT', 'ANSWERED', 'INTERESTED', 'NO_ANSWER', 'REJECTED', 'BOUNCED', 'OPT_OUT', 'SCHEDULED']),
  note: z.string().max(2000).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const parsed = BodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return handleApiError(parsed.error)
    const { leadId, channel, outcome, note } = parsed.data

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, userId: admin.id },
      select: { id: true, phone: true },
    })
    if (!lead) {
      return handleApiError(
        Object.assign(new Error('lead não encontrado'), { code: 'NOT_FOUND', httpStatus: 404 }),
      )
    }

    const res = await applyOutcome({ leadId, userId: admin.id, channel, outcome, note })

    // Opt-out: suprime o telefone para nunca mais entrar na fila.
    if (outcome === 'OPT_OUT' && lead.phone) {
      await addSuppression({
        kind: 'PHONE',
        value: lead.phone,
        reason: 'UNSUBSCRIBED',
        source: 'contato-direto',
        createdBy: admin.id,
        notes: note,
      }).catch(() => undefined)
    }

    return successResponse({ contactEventId: res.contactEventId, transitioned: res.transitioned })
  } catch (error) {
    return handleApiError(error)
  }
}
