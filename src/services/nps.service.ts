import { prisma } from '@/lib/prisma'
import { getConfig } from '@/lib/services/system-config'
import { AuditService } from '@/lib/services/audit-service'
import { bucketFor, type NpsBucket, type NpsSubmitInput } from '@/lib/schemas/nps'
import type { NpsResponse } from '@prisma/client'

/**
 * NPS Service — M14-G-006/G-019/G-020/G-021.
 *
 * Trigger condicional (G-006): elegibilidade depende de
 *   nps.enabled + (dias ativo OU leads coletados) + cooldown.
 * Audit log + notificacao admin de detractor (G-020) sao disparados
 * em `submit()`. Rate-limit por cooldown (G-021) checado na elegibilidade.
 */

export interface NpsEligibility {
  eligible: boolean
  reason: 'eligible' | 'disabled' | 'cooldown' | 'not_qualified' | 'not_found'
  cooldownEndsAt?: string
}

export interface NpsAggregate {
  totalResponses: number
  npsScore: number // -100..100
  distribution: number[] // length 11 (index 0..10)
  detractors: number
  passives: number
  promoters: number
  averageScore: number
}

export interface NpsCommentEntry {
  id: string
  score: number
  bucket: NpsBucket
  comment: string | null
  submittedAt: Date
  userMaskedEmail: string
}

export class NpsService {
  /**
   * Verifica se o usuario pode responder NPS agora.
   * - feature flag nps.enabled deve estar true
   * - usuario deve atender criterios (dias ativo OU leads coletados)
   * - usuario nao pode ter respondido nos ultimos `nps.response_cooldown_days`
   */
  async getEligibility(userId: string): Promise<NpsEligibility> {
    const enabledCfg = await getConfig<{ value: boolean }>('nps.enabled')
    if (!enabledCfg.value) return { eligible: false, reason: 'disabled' }

    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { id: true, createdAt: true, role: true, tags: true },
    })
    if (!profile) return { eligible: false, reason: 'not_found' }

    // Excluir ADMINs do pool NPS para nao contaminar score (M14 review).
    if (profile.role === 'ADMIN') return { eligible: false, reason: 'not_qualified' }

    // Gate opcional por cohort piloto (M14 review): quando nps.pilot_only=true,
    // somente usuarios com tag 'pilot' recebem o widget.
    const pilotOnlyCfg = await getConfig<{ value: boolean }>('nps.pilot_only').catch(
      () => ({ value: false })
    )
    if (pilotOnlyCfg?.value) {
      const tags = (profile.tags ?? []) as string[]
      if (!tags.includes('pilot')) return { eligible: false, reason: 'not_qualified' }
    }

    const cooldownCfg = await getConfig<{ value: number }>('nps.response_cooldown_days')
    const cooldownDays = Number(cooldownCfg.value ?? 90)

    const lastResponse = await prisma.npsResponse.findFirst({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
      select: { submittedAt: true },
    })

    if (lastResponse) {
      const cooldownEndsAt = new Date(
        lastResponse.submittedAt.getTime() + cooldownDays * 24 * 60 * 60 * 1000
      )
      if (cooldownEndsAt > new Date()) {
        return {
          eligible: false,
          reason: 'cooldown',
          cooldownEndsAt: cooldownEndsAt.toISOString(),
        }
      }
    }

    const minDaysCfg = await getConfig<{ value: number }>('nps.min_days_active')
    const minLeadsCfg = await getConfig<{ value: number }>('nps.min_leads_collected')
    const minDays = Number(minDaysCfg.value ?? 7)
    const minLeads = Number(minLeadsCfg.value ?? 3)

    const ageMs = Date.now() - profile.createdAt.getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)

    const leadCount = await prisma.lead.count({ where: { userId } })

    const qualified = ageDays >= minDays || leadCount >= minLeads
    if (!qualified) return { eligible: false, reason: 'not_qualified' }

    return { eligible: true, reason: 'eligible' }
  }

  /**
   * Submete uma resposta de NPS. Bloqueia se nao elegivel (G-021 rate-limit
   * via cooldown). Dispara audit log + alerta admin para detractor (G-020).
   */
  async submit(
    userId: string,
    payload: NpsSubmitInput,
    ctx: { userAgent?: string; ipAddress?: string } = {}
  ): Promise<NpsResponse> {
    const eligibility = await this.getEligibility(userId)
    if (!eligibility.eligible) {
      const err = Object.assign(new Error('NPS_NOT_ELIGIBLE'), {
        code: 'NPS_NOT_ELIGIBLE',
        httpStatus: 409,
        details: { reason: eligibility.reason, cooldownEndsAt: eligibility.cooldownEndsAt },
      })
      throw err
    }

    const response = await prisma.npsResponse.create({
      data: {
        userId,
        score: payload.score,
        comment: payload.comment ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    })

    const bucket = bucketFor(payload.score)

    await AuditService.log({
      userId,
      action: 'nps.submitted',
      resource: 'nps_responses',
      resourceId: response.id,
      metadata: { score: String(payload.score), bucket },
      ipAddress: ctx.ipAddress,
    })

    if (bucket === 'detractor') {
      await this.notifyAdminsDetractor(response).catch((err) => {
        // Sem propagar erro — nunca falhar submit por erro de notificacao.
        console.error('[nps] failed to notify detractor', err)
      })
    }

    return response
  }

  /**
   * Notifica admins de detractor (G-020). Cria notificacao in-app para cada
   * admin (segue padrao Zero Silencio do dispatcher central).
   */
  private async notifyAdminsDetractor(response: NpsResponse): Promise<void> {
    const admins = await prisma.userProfile.findMany({
      where: { role: 'ADMIN', deactivatedAt: null },
      select: { id: true },
    })

    await Promise.all(
      admins.map((admin) =>
        prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'NPS_DETRACTOR',
            title: 'NPS detractor recebido',
            message: `Usuario reportou NPS ${response.score}. Comentario: ${response.comment ?? '(sem comentario)'}`,
            data: {
              npsResponseId: response.id,
              score: response.score,
              userId: response.userId,
            },
          },
        })
      )
    )
  }

  /**
   * Agrega NPS para um periodo. Usado em /admin/feedback.
   * Exclui respostas de usuarios ADMIN para nao contaminar o score (M14 review).
   */
  async aggregate(periodStart?: Date, periodEnd?: Date): Promise<NpsAggregate> {
    const where = {
      user: { role: { not: 'ADMIN' as const } },
      ...(periodStart || periodEnd
        ? {
            submittedAt: {
              ...(periodStart ? { gte: periodStart } : {}),
              ...(periodEnd ? { lte: periodEnd } : {}),
            },
          }
        : {}),
    }

    const responses = await prisma.npsResponse.findMany({
      where,
      select: { score: true },
    })

    const total = responses.length
    const distribution = Array.from({ length: 11 }, () => 0)
    let detractors = 0
    let passives = 0
    let promoters = 0
    let scoreSum = 0

    for (const r of responses) {
      distribution[r.score]++
      scoreSum += r.score
      const b = bucketFor(r.score)
      if (b === 'detractor') detractors++
      else if (b === 'passive') passives++
      else promoters++
    }

    const npsScore =
      total === 0 ? 0 : Math.round(((promoters - detractors) / total) * 100)
    const averageScore = total === 0 ? 0 : Math.round((scoreSum / total) * 10) / 10

    return {
      totalResponses: total,
      npsScore,
      distribution,
      detractors,
      passives,
      promoters,
      averageScore,
    }
  }

  /**
   * Lista comentarios recentes (para painel admin), com email do usuario
   * mascarado. Bucket calculado on-the-fly.
   */
  async listComments(opts: {
    bucket?: NpsBucket
    periodStart?: Date
    periodEnd?: Date
    limit?: number
  } = {}): Promise<NpsCommentEntry[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)

    const where = {
      user: { role: { not: 'ADMIN' as const } },
      ...(opts.bucket
        ? {
            score:
              opts.bucket === 'detractor'
                ? { lte: 6 }
                : opts.bucket === 'passive'
                  ? { gte: 7, lte: 8 }
                  : { gte: 9 },
          }
        : {}),
      ...(opts.periodStart || opts.periodEnd
        ? {
            submittedAt: {
              ...(opts.periodStart ? { gte: opts.periodStart } : {}),
              ...(opts.periodEnd ? { lte: opts.periodEnd } : {}),
            },
          }
        : {}),
    }

    const rows = await prisma.npsResponse.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      take: limit,
      include: { user: { select: { email: true } } },
    })

    return rows.map((row) => ({
      id: row.id,
      score: row.score,
      bucket: bucketFor(row.score),
      comment: row.comment,
      submittedAt: row.submittedAt,
      userMaskedEmail: maskEmail(row.user.email),
    }))
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  const head = local.slice(0, 2)
  return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`
}

export const npsService = new NpsService()
