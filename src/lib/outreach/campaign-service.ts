import 'server-only'

/**
 * outreach-engine (brainstorm 06-10): ciclo de vida de campanha cold-outbound.
 *
 * Donos explicitos (SystemConfig outreach.owners):
 *  - aprovacao de campanha: operador humano (criterio de falha 1, Fase 1 —
 *    nenhum lote em massa sem aprovacao registrada);
 *  - replay: operador humano (F-22 — replayToken impede duplo envio);
 *  - rollback: operador humano (task 30 — snapshot + trilha, sem apagar
 *    estado anterior).
 */
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { Prisma, OutreachCampaign } from '@prisma/client'
import { extractDomain, normalizeEmail, checkSuppression } from './suppression'
import { pickHealthyMailbox } from './mailbox-service'
import { dispatchOutreachSend } from '@/lib/workers/outreach-dispatch'
import { getConfig } from '@/lib/services/system-config'
import { track, makeCorrelationId } from '@/lib/telemetry'
import { isGenericEmail } from '@/lib/intelligence/enrichment/enrichers'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface CreateCampaignInput {
  userId: string
  name: string
  market?: string
  niche?: string
  sequenceId?: string
  slaHours?: number
  abConfig?: { variants: Array<{ key: string; subject?: string; body?: string }> }
}

export async function createCampaign(input: CreateCampaignInput): Promise<{ id: string }> {
  const row = await prisma.outreachCampaign.create({
    data: {
      userId: input.userId,
      name: input.name,
      market: (input.market ?? 'BR').toUpperCase(),
      niche: input.niche,
      sequenceId: input.sequenceId,
      slaHours: input.slaHours,
      abConfig: input.abConfig as unknown as Prisma.InputJsonValue,
      status: 'DRAFT',
      dryRun: true,
    },
    select: { id: true },
  })
  return { id: row.id }
}

/**
 * Aprovacao humana registrada (Fase 1 do fonte). Quem aprova fica gravado;
 * a campanha vai para ACTIVE mas permanece dryRun=true ate ser armada
 * explicitamente via armCampaign (duas decisoes humanas distintas).
 */
export async function approveCampaign(
  campaignId: string,
  approvedBy: string,
): Promise<OutreachCampaign> {
  const campaign = await prisma.outreachCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'ACTIVE',
      reviewedBy: approvedBy,
      reviewedAt: new Date(),
      approvedBy,
      approvedAt: new Date(),
    },
  })
  await track({
    kind: 'outreach.dispatched',
    correlationId: makeCorrelationId('campaign'),
    userId: approvedBy,
    resourceType: 'outreach_campaign',
    resourceId: campaignId,
    metadata: { action: 'approved' },
  }).catch(() => undefined)
  return campaign
}

/**
 * Desliga o dry-run da campanha (envio real). Exige (a) aprovacao humana
 * registrada e (b) preflight de producao verde (task 31 — gate de ativacao).
 */
export async function armCampaign(campaignId: string, armedBy: string): Promise<void> {
  const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign?.approvedBy || !campaign.approvedAt) {
    throw Object.assign(new Error('campanha sem aprovacao humana registrada — nao pode ser armada'), {
      code: 'OUTREACH_NOT_APPROVED',
      httpStatus: 409,
    })
  }
  const { isProductionPreflightPassed } = await import('./production-preflight')
  const preflight = await isProductionPreflightPassed()
  if (!preflight.passed) {
    throw Object.assign(
      new Error('Antes de liberar o envio real, é preciso passar na verificação de prontidão. Clique em "Liberar envio real" novamente que a verificação roda automaticamente.'),
      { code: 'OUTREACH_PREFLIGHT_REQUIRED', httpStatus: 409 },
    )
  }
  await prisma.outreachCampaign.update({
    where: { id: campaignId },
    data: { dryRun: false, metadata: { armedBy, armedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue },
  })
}

export async function pauseCampaign(
  campaignId: string,
  reason: string,
  by?: string,
): Promise<void> {
  await prisma.outreachCampaign.update({
    where: { id: campaignId },
    data: { status: 'PAUSED', pausedAt: new Date(), pauseReason: reason.slice(0, 500) },
  })
  await track({
    kind: 'outreach.campaign_paused',
    correlationId: makeCorrelationId('campaign'),
    userId: by ?? null,
    resourceType: 'outreach_campaign',
    resourceId: campaignId,
    metadata: { reason },
  }).catch(() => undefined)
}

/** Liberacao explicita (task 17: sem retomada automatica). */
export async function resumeCampaign(campaignId: string, by: string): Promise<void> {
  await prisma.outreachCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'ACTIVE',
      pausedAt: null,
      pauseReason: null,
      metadata: { resumedBy: by, resumedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue,
    },
  })
}

// ─── Auto-enroll: agendamento de envio para um grupo de leads ──────────────

export interface AutoEnrollConfig {
  enabled: boolean
  /** Maximo de leads novos inscritos por dia nesta campanha (proteca­o reputacional). */
  dailyCap: number
}

const DEFAULT_AUTO_ENROLL: AutoEnrollConfig = { enabled: false, dailyCap: 25 }

function readAutoEnroll(metadata: unknown): AutoEnrollConfig {
  const m = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {}
  const ae = (m.autoEnroll ?? {}) as Partial<AutoEnrollConfig>
  return {
    enabled: ae.enabled === true,
    dailyCap: Math.max(1, Math.min(1000, Number(ae.dailyCap ?? DEFAULT_AUTO_ENROLL.dailyCap))),
  }
}

/**
 * Liga/desliga o envio automatico de novos leads do grupo (nicho + envelope de
 * qualidade) da campanha. So vale para campanhas que ja podem enviar de
 * verdade — o gate de envio (preflight/kill-switch/supressao) continua valendo
 * a cada lead inscrito.
 */
export async function setCampaignAutoEnroll(
  campaignId: string,
  config: { enabled: boolean; dailyCap?: number },
  by: string,
): Promise<AutoEnrollConfig> {
  const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId }, select: { metadata: true } })
  if (!campaign) {
    throw Object.assign(new Error('campanha inexistente'), { code: 'OUTREACH_CAMPAIGN_NOT_FOUND', httpStatus: 404 })
  }
  const base = campaign.metadata && typeof campaign.metadata === 'object' && !Array.isArray(campaign.metadata)
    ? (campaign.metadata as Record<string, unknown>)
    : {}
  const next: AutoEnrollConfig = {
    enabled: config.enabled,
    dailyCap: Math.max(1, Math.min(1000, Number(config.dailyCap ?? readAutoEnroll(campaign.metadata).dailyCap))),
  }
  await prisma.outreachCampaign.update({
    where: { id: campaignId },
    data: { metadata: { ...base, autoEnroll: { ...next, updatedBy: by, updatedAt: new Date().toISOString() } } as unknown as Prisma.InputJsonValue },
  })
  return next
}

export interface AutoEnrollRunResult {
  campaignsProcessed: number
  totalEnrolled: number
  perCampaign: Array<{ campaignId: string; name: string; enrolled: number; skipped: number; capReached: boolean }>
}

/**
 * Roda no cron (outreach-scheduler): para cada campanha ATIVA, aprovada, em
 * envio real e com auto-enroll ligado, inscreve os leads NOVOS elegiveis do
 * grupo (nicho + email + integridade + nao-suprimido) ate o cap diario. Os
 * dispatches criados sao enviados pelo proprio scheduler dentro da janela da
 * caixa, com throttle e supressao. Idempotente: o partial-unique impede
 * reinscricao de um lead com envio ativo; o cap diario conta os dispatches ja
 * criados hoje para a campanha.
 */
export async function runAutoEnrollment(
  now: Date = new Date(),
  // enqueue injetavel para teste (binding ESM nao permite spy no call interno).
  deps: { enqueue?: typeof enqueueCampaignDispatches } = {},
): Promise<AutoEnrollRunResult> {
  const enqueue = deps.enqueue ?? enqueueCampaignDispatches
  const result: AutoEnrollRunResult = { campaignsProcessed: 0, totalEnrolled: 0, perCampaign: [] }
  const campaigns = await prisma.outreachCampaign.findMany({
    where: { status: 'ACTIVE', dryRun: false, approvedBy: { not: null } },
    select: { id: true, name: true, metadata: true },
  })
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)

  for (const c of campaigns) {
    const cfg = readAutoEnroll(c.metadata)
    if (!cfg.enabled) continue
    result.campaignsProcessed += 1

    const enrolledToday = await prisma.outreachDispatch.count({
      where: { campaignId: c.id, sequenceStep: 1, createdAt: { gte: dayStart } },
    })
    const remaining = cfg.dailyCap - enrolledToday
    if (remaining <= 0) {
      result.perCampaign.push({ campaignId: c.id, name: c.name, enrolled: 0, skipped: 0, capReached: true })
      continue
    }

    try {
      const enq = await enqueue(c.id, { limit: remaining })
      result.totalEnrolled += enq.created
      result.perCampaign.push({ campaignId: c.id, name: c.name, enrolled: enq.created, skipped: enq.skipped.length, capReached: enq.created >= remaining })
      if (enq.created > 0) {
        await track({
          kind: 'outreach.dispatched',
          correlationId: makeCorrelationId('auto-enroll'),
          userId: null,
          resourceType: 'outreach_campaign',
          resourceId: c.id,
          metadata: { autoEnroll: true, enrolled: enq.created, capRemaining: remaining },
        }).catch(() => undefined)
      }
    } catch {
      // campanha deixou de ser elegivel entre o find e o enqueue: ignora
      result.perCampaign.push({ campaignId: c.id, name: c.name, enrolled: 0, skipped: 0, capReached: false })
    }
  }
  return result
}

export function getCampaignAutoEnroll(metadata: unknown): AutoEnrollConfig {
  return readAutoEnroll(metadata)
}

/**
 * Diagnostico HONESTO do enqueue. Sai da MESMA classificacao usada para inserir
 * (nao e uma contagem paralela que pode divergir). Categorias NAO sao exclusivas
 * apenas na leitura humana: aqui cada lead cai na PRIMEIRA razao que o barra (a
 * mesma ordem do loop real), entao os contadores SOMAM com `eligible` == analyzed.
 */
export interface EnqueueDiagnostics {
  analyzed: number
  analyzedCapped: boolean
  noEmail: number
  malformedEmail: number
  genericBlocked: number
  lowIntegrity: number
  suppressed: number
  alreadyQueued: number
  eligible: number
}

export interface EnqueueResult {
  created: number
  skipped: Array<{ leadId: string; reason: string }>
  dispatchIds: string[]
  diagnostics: EnqueueDiagnostics
}

const ENQUEUE_ANALYSIS_CAP = 2000

interface QualityGateConfig {
  minIntegrityScore?: number
  blockGenericEmail?: boolean
}

/**
 * Cria os dispatches do passo 1 para os leads elegiveis e enfileira via
 * dispatchOutreachSend (preflight como gate). Envelope de qualidade
 * (task 19/F-19): sem e-mail valido, suprimido, ou integridade abaixo do
 * limiar => lead NAO entra em modo automatico (fica em skipped, com motivo
 * — revisao humana decide).
 */
export async function enqueueCampaignDispatches(
  campaignId: string,
  options: { leadIds?: string[]; limit?: number } = {},
): Promise<EnqueueResult> {
  const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) {
    throw Object.assign(new Error('campanha inexistente'), { code: 'OUTREACH_CAMPAIGN_NOT_FOUND', httpStatus: 404 })
  }
  if (campaign.status !== 'ACTIVE' || !campaign.approvedBy) {
    throw Object.assign(
      new Error('lote em massa exige campanha ACTIVE com aprovacao humana registrada'),
      { code: 'OUTREACH_NOT_APPROVED', httpStatus: 409 },
    )
  }

  const quality = await getConfig<QualityGateConfig>('outreach.quality_gate')
  const minIntegrity = Number(quality.minIntegrityScore ?? 60)
  const blockGeneric = quality.blockGenericEmail === true

  // Pool de candidatos SEM pre-filtro de e-mail: leads sem e-mail tambem sao
  // analisados e CONTADOS (honestidade — antes ficavam invisiveis e a UI
  // mentia "verifique filtro/nicho"). O filtro de nicho continua exato, mas a
  // UI alimenta o nicho a partir das facetas reais (sem mismatch plural/caixa).
  const candidates = await prisma.lead.findMany({
    where: {
      userId: campaign.userId,
      ...(options.leadIds ? { id: { in: options.leadIds } } : {}),
      status: { in: ['NEW', 'CONTACTED'] },
      ...(campaign.niche ? { niche: campaign.niche } : {}),
    },
    orderBy: { score: 'desc' },
    take: ENQUEUE_ANALYSIS_CAP + 1,
    select: { id: true, email: true, score: true, integrityScore: true },
  })
  const analyzedCapped = candidates.length > ENQUEUE_ANALYSIS_CAP
  const leads = analyzedCapped ? candidates.slice(0, ENQUEUE_ANALYSIS_CAP) : candidates

  const sendCap = options.limit ?? 100
  const mailbox = await pickHealthyMailbox()
  const abVariants = (campaign.abConfig as { variants?: Array<{ key: string }> } | null)?.variants

  const diagnostics: EnqueueDiagnostics = {
    analyzed: leads.length,
    analyzedCapped,
    noEmail: 0,
    malformedEmail: 0,
    genericBlocked: 0,
    lowIntegrity: 0,
    suppressed: 0,
    alreadyQueued: 0,
    eligible: 0,
  }
  const result: EnqueueResult = { created: 0, skipped: [], dispatchIds: [], diagnostics }
  let index = 0
  for (const lead of leads) {
    const email = lead.email ? normalizeEmail(lead.email) : null
    if (!email) {
      diagnostics.noEmail += 1
      result.skipped.push({ leadId: lead.id, reason: 'sem e-mail' })
      continue
    }
    // Forma de email valida (hard-check do envelope F-19): email nao-null mas
    // malformado (ex.: 'a-definir', 'tbd@') nao deve consumir slot de dispatch.
    if (!EMAIL_SHAPE.test(email)) {
      diagnostics.malformedEmail += 1
      result.skipped.push({ leadId: lead.id, reason: `e-mail malformado: ${email}` })
      continue
    }
    if (blockGeneric && isGenericEmail(email)) {
      diagnostics.genericBlocked += 1
      result.skipped.push({ leadId: lead.id, reason: 'e-mail generico bloqueado pelo envelope de qualidade' })
      continue
    }
    // Gate de integridade: null = nunca pontuado => bloqueia (reprocessar),
    // nao passa silenciosamente. So entra em auto-outbound quem tem score >=
    // limiar (Aceite F-19: lead com dado fraco nao entra em modo automatico).
    if (lead.integrityScore === null || lead.integrityScore < minIntegrity) {
      diagnostics.lowIntegrity += 1
      result.skipped.push({
        leadId: lead.id,
        reason:
          lead.integrityScore === null
            ? 'sem score de integridade (lead nao reprocessado apos F-19) — revisao humana'
            : `integridade ${lead.integrityScore} abaixo do limiar ${minIntegrity} — revisao humana`,
      })
      continue
    }
    const suppression = await checkSuppression(email)
    if (suppression.suppressed) {
      diagnostics.suppressed += 1
      result.skipped.push({ leadId: lead.id, reason: `suprimido (${suppression.reason})` })
      continue
    }

    const existing = await prisma.outreachDispatch.findFirst({
      where: { campaignId, leadId: lead.id, sequenceStep: 1, channel: 'EMAIL' },
      select: { id: true },
    })
    if (existing) {
      diagnostics.alreadyQueued += 1
      result.skipped.push({ leadId: lead.id, reason: 'dispatch ja existe para o passo 1' })
      continue
    }

    // Elegivel. Se ja batemos o limite do lote, conta como elegivel mas nao
    // cria agora (o operador pode rodar de novo para puxar o restante).
    diagnostics.eligible += 1
    if (result.created >= sendCap) {
      result.skipped.push({ leadId: lead.id, reason: 'elegivel — fora do limite deste lote' })
      continue
    }

    const abVariant =
      abVariants && abVariants.length > 0 ? abVariants[index % abVariants.length].key : null

    try {
      const dispatch = await prisma.outreachDispatch.create({
        data: {
          campaignId,
          leadId: lead.id,
          userId: campaign.userId,
          mailboxId: mailbox?.id ?? null,
          sequenceStep: 1,
          channel: 'EMAIL',
          status: 'SCHEDULED',
          priority: lead.score,
          toEmail: email,
          toDomain: extractDomain(email),
          abVariant,
          replayToken: `${randomUUID()}#s1`,
          scheduledAt: new Date(Date.now() + index * (mailbox?.minGapSeconds ?? 90) * 1000),
          dryRun: campaign.dryRun,
        },
        select: { id: true },
      })
      result.created += 1
      result.dispatchIds.push(dispatch.id)
      index += 1
    } catch (err) {
      // Partial unique (lead, channel) ativo: ja ha envio ativo p/ este lead.
      if ((err as { code?: string }).code === 'P2002') {
        result.skipped.push({ leadId: lead.id, reason: 'ja existe envio ativo para este lead/canal' })
        continue
      }
      throw err
    }
  }

  // Enfileira os imediatamente devidos; os futuros ficam para o scheduler.
  const due = await prisma.outreachDispatch.findMany({
    where: { id: { in: result.dispatchIds }, scheduledAt: { lte: new Date() } },
    select: { id: true },
  })
  for (const d of due) {
    await dispatchOutreachSend({ dispatchId: d.id }).catch(() => undefined)
  }

  return result
}

/**
 * Replay seguro (task 13/F-22): re-tentativa explicita de dispatch
 * AMBIGUOUS/FAILED. O token deterministico `{original}#r{n}` com unique
 * constraint garante que o MESMO replay nunca duplica (P2002 = ja
 * replayado). Trilha em telemetria; estado anterior preservado.
 */
export async function replayDispatch(
  dispatchId: string,
  by: string,
): Promise<{ newDispatchId: string } | { alreadyReplayed: true }> {
  const original = await prisma.outreachDispatch.findUnique({ where: { id: dispatchId } })
  if (!original) {
    throw Object.assign(new Error('dispatch inexistente'), { code: 'OUTREACH_DISPATCH_NOT_FOUND', httpStatus: 404 })
  }
  if (!['AMBIGUOUS', 'FAILED', 'FAILED_PERMANENT', 'CANCELLED'].includes(original.status)) {
    throw Object.assign(
      new Error(`replay so e permitido para estados terminais de falha (atual: ${original.status})`),
      { code: 'OUTREACH_REPLAY_INVALID_STATE', httpStatus: 409 },
    )
  }

  // replayToken robusto (fix da revisao): numero sequencial para leitura +
  // sufixo aleatorio para evitar colisao entre dois replays concorrentes (o
  // calculo do contador nao e atomico; sem o sufixo, dois replays simultaneos
  // gerariam o mesmo #r{n} e um seria perdido por P2002). Replay e acao humana
  // explicita — cada clique materializa um novo dispatch.
  const replayCount = await prisma.outreachDispatch.count({
    where: { replayToken: { startsWith: `${original.replayToken}#r` } },
  })
  const replayToken = `${original.replayToken}#r${replayCount + 1}-${randomUUID().slice(0, 8)}`

  try {
    const created = await prisma.outreachDispatch.create({
      data: {
        campaignId: original.campaignId,
        leadId: original.leadId,
        userId: original.userId,
        mailboxId: original.mailboxId,
        sequenceStep: original.sequenceStep,
        channel: original.channel,
        status: 'SCHEDULED',
        priority: original.priority,
        toEmail: original.toEmail,
        toDomain: original.toDomain,
        subject: original.subject,
        abVariant: original.abVariant,
        replayToken,
        scheduledAt: new Date(),
        dryRun: original.dryRun,
        metadata: {
          replayedFrom: original.id,
          replayedBy: by,
          replayedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    await track({
      kind: 'outreach.replayed',
      correlationId: makeCorrelationId('outreach'),
      userId: by,
      resourceType: 'outreach_dispatch',
      resourceId: created.id,
      metadata: { replayedFrom: original.id, replayToken },
    }).catch(() => undefined)
    await dispatchOutreachSend({ dispatchId: created.id }).catch(() => undefined)
    return { newDispatchId: created.id }
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return { alreadyReplayed: true }
    }
    throw err
  }
}

/**
 * Task 26 (F-26): fecha o A/B da campanha. Calcula as taxas por variante a
 * partir dos dispatches SENT vs respondidos e, se o criterio estatistico for
 * atingido, grava o vencedor em abConfig.winner (template vencedor aplicado
 * SO com significancia — Aceite task 26). Sem decisao, registra o motivo.
 */
export async function evaluateCampaignAbWinner(
  campaignId: string,
): Promise<import('./ab-testing').AbDecision> {
  const { decideAbWinner } = await import('./ab-testing')
  const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId } })
  const variants = (campaign?.abConfig as { variants?: Array<{ key: string }> } | null)?.variants ?? []
  const cfg = await getConfig<{ minSamplePerVariant?: number; significanceLevel?: number; ratifiedBy?: string | null }>(
    'outreach.ab_testing',
  )

  const stats = await Promise.all(
    variants.map(async (v) => {
      const [sent, replied] = await Promise.all([
        prisma.outreachDispatch.count({ where: { campaignId, abVariant: v.key, status: 'SENT' } }),
        prisma.outreachDispatch.count({
          where: { campaignId, abVariant: v.key, repliedAt: { not: null }, replyOutcome: { notIn: ['BOUNCED'] } },
        }),
      ])
      return { key: v.key, sent, replied }
    }),
  )

  const decision = decideAbWinner(stats, {
    minSamplePerVariant: Number(cfg.minSamplePerVariant ?? 200),
    significanceLevel: Number(cfg.significanceLevel ?? 0.05),
    ratifiedBy: cfg.ratifiedBy ?? null,
  })

  if (decision.decided && decision.winner) {
    const base = (campaign?.abConfig as Record<string, unknown> | null) ?? {}
    await prisma.outreachCampaign.update({
      where: { id: campaignId },
      data: {
        abConfig: { ...base, winner: decision.winner, decidedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue,
      },
    })
  }
  return decision
}

/**
 * Task 30: rollback operacional de campanha — cancela todo trabalho futuro,
 * preserva 100% do historico e grava snapshot auditavel (antes/depois).
 * Reversao via trilha: nada e apagado.
 */
export async function rollbackCampaign(
  campaignId: string,
  by: string,
  reason: string,
): Promise<{ cancelled: number }> {
  const before = await prisma.outreachDispatch.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  })

  const res = await prisma.outreachDispatch.updateMany({
    where: { campaignId, status: { in: ['SCHEDULED', 'LOCKED'] } },
    data: { status: 'CANCELLED', reasonCode: 'idempotency', failReason: `rollback: ${reason}`.slice(0, 2000) },
  })
  await prisma.outreachCampaign.update({
    where: { id: campaignId },
    data: { status: 'CANCELLED', pauseReason: `rollback: ${reason}`.slice(0, 500), pausedAt: new Date() },
  })

  await track({
    kind: 'outreach.rollback',
    correlationId: makeCorrelationId('rollback'),
    userId: by,
    resourceType: 'outreach_campaign',
    resourceId: campaignId,
    metadata: {
      reason,
      cancelled: res.count,
      snapshotBefore: Object.fromEntries(before.map((b) => [b.status, b._count._all])),
    },
  }).catch(() => undefined)

  return { cancelled: res.count }
}
