/**
 * outreach-engine (brainstorm 06-10): acoes de governanca de campanha.
 * approve/arm/pause/resume/rollback/enqueue/replay/approve-market/ab-evaluate.
 * Toda acao destrutiva exige `reason` e gera AuditLog (Aceite tasks 16/30).
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { AuditService } from '@/lib/services/audit-service'
import {
  approveCampaign,
  armCampaign,
  pauseCampaign,
  resumeCampaign,
  rollbackCampaign,
  enqueueCampaignDispatches,
  evaluateCampaignAbWinner,
  setCampaignAutoEnroll,
} from '@/lib/outreach/campaign-service'

const ActionSchema = z.object({
  action: z.enum([
    'approve',
    'arm',
    'pause',
    'resume',
    'rollback',
    'enqueue',
    'approve-market',
    'ab-evaluate',
    'set-auto-enroll',
  ]),
  reason: z.string().min(3).max(500).optional(),
  leadIds: z.array(z.string().uuid()).optional(),
  limit: z.number().int().positive().max(1000).optional(),
  // auto-enroll (agendamento de envio automatico para o grupo de leads)
  enabled: z.boolean().optional(),
  dailyCap: z.number().int().positive().max(1000).optional(),
})

const AUDIT_ACTION = {
  approve: 'outreach.campaign_approved',
  arm: 'outreach.campaign_armed',
  pause: 'outreach.campaign_paused',
  resume: 'outreach.campaign_resumed',
  rollback: 'outreach.campaign_rolled_back',
  'approve-market': 'outreach.market_gate_updated',
} as const

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin()
    const { id } = await params
    const parsed = ActionSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return handleApiError(parsed.error)
    const { action, reason } = parsed.data

    const destructive = ['pause', 'rollback'].includes(action)
    if (destructive && !reason) {
      return handleApiError(Object.assign(new Error('reason obrigatorio para esta acao'), { code: 'VALIDATION', httpStatus: 400 }))
    }

    // Multi-tenant guard: o ADMIN so opera campanhas que ELE criou. Sem isto,
    // um admin poderia enfileirar/disparar campanhas (e a base de leads) de
    // outro tenant.
    const owned = await prisma.outreachCampaign.findFirst({
      where: { id, userId: admin.id },
      select: { id: true },
    })
    if (!owned) {
      return handleApiError(Object.assign(new Error('campanha nao encontrada'), { code: 'NOT_FOUND', httpStatus: 404 }))
    }

    let result: unknown
    switch (action) {
      case 'approve':
        result = await approveCampaign(id, admin.id)
        break
      case 'arm':
        await armCampaign(id, admin.id)
        result = { armed: true }
        break
      case 'pause':
        await pauseCampaign(id, reason!, admin.id)
        result = { paused: true }
        break
      case 'resume':
        await resumeCampaign(id, admin.id)
        result = { resumed: true }
        break
      case 'rollback':
        result = await rollbackCampaign(id, admin.id, reason!)
        break
      case 'enqueue':
        result = await enqueueCampaignDispatches(id, { leadIds: parsed.data.leadIds, limit: parsed.data.limit })
        break
      case 'approve-market':
        await prisma.outreachCampaign.update({
          where: { id },
          data: { marketGateApprovedBy: admin.id, marketGateApprovedAt: new Date() },
        })
        result = { marketApproved: true }
        break
      case 'ab-evaluate':
        result = await evaluateCampaignAbWinner(id)
        break
      case 'set-auto-enroll':
        result = await setCampaignAutoEnroll(id, { enabled: parsed.data.enabled ?? false, dailyCap: parsed.data.dailyCap }, admin.id)
        break
    }

    const auditAction = (AUDIT_ACTION as Record<string, string>)[action]
    if (auditAction) {
      await AuditService.log({
        userId: admin.id,
        action: auditAction as never,
        resource: 'outreach_campaign',
        resourceId: id,
        metadata: { reason: reason ?? null, action },
      })
    }

    return successResponse(result)
  } catch (error) {
    return handleApiError(error)
  }
}
