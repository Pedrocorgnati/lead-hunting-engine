import 'server-only'

/**
 * outreach-engine (brainstorm 06-10, task 08 — F-09): worker do kind
 * 'outreach-send'. Payload minimo { dispatchId } (padrao export/budgetflow);
 * todo o resto hidrata do banco.
 *
 * Maquina de estados do dispatch (task 02):
 *   SCHEDULED -> LOCKED -> SENDING -> SENT | FAILED | AMBIGUOUS |
 *   FAILED_PERMANENT;  SUPPRESSED/CANCELLED administrativos.
 *
 * Garantias:
 *  - Claim idempotente: updateMany guarded SCHEDULED->LOCKED; conflito de
 *    claim = no-op silencioso-mas-logado, NUNCA mensagem duplicada.
 *  - Supressao SEMPRE antes do envio (task 10); infra indisponivel => DRY_RUN
 *    (contingencia 9.1).
 *  - Janela/kill-switch (task 11): fora da janela = defer sem falha hard;
 *    kill-switch desligado = nada sai.
 *  - Anti-bounce por dominio (task 14): cooldown + cap diario por dominio.
 *  - Integracao ContactEvent + Lead.status transacional (task 09).
 *  - Pausa de sequencia (task 13): passo >1 so envia se nao houve reply/
 *    opt-out e a sequencia nao esta pausada.
 *  - Erro de rede APOS comando de envio => AMBIGUOUS (nunca re-envio cego;
 *    re-tentativa apenas via replay explicito, task 13/F-22).
 */
import { prisma } from '@/lib/prisma'
import type { OutreachDispatch, OutreachCampaign, OutreachMailbox, Prisma } from '@prisma/client'
import { CodedError, PoisonPayloadError } from './reason-codes'
import { checkOutboundPreconditions } from '@/lib/outreach/preflight'
import { checkSuppression } from '@/lib/outreach/suppression'
import { computeSendAt, isWithinSendWindow } from '@/lib/outreach/send-window'
import { toSmtpConfig, markMailboxUnhealthy } from '@/lib/outreach/mailbox-service'
import { sendViaSmtp } from '@/lib/outreach/smtp-transport'
import { applyOutcome, checkLeadEventConsistency } from '@/lib/outreach/lead-status-bridge'
import { ensureLeadPitch, PitchUnavailableError, PitchRejectedError } from '@/lib/outreach/pitch-bridge'
import { getSenderProfile } from '@/lib/outreach/sender-profile'
import { buildLeadVars, buildSenderVars } from '@/lib/pitch/template-vars'
import { getOutreachThresholds } from '@/lib/services/system-config'
import { track, makeCorrelationId } from '@/lib/telemetry'
import { addSuppression } from '@/lib/outreach/suppression'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MAX_DISPATCH_ATTEMPTS = 3

interface DispatchWithRelations extends OutreachDispatch {
  campaign: OutreachCampaign
  mailbox: OutreachMailbox | null
}

function metaOf(dispatch: OutreachDispatch): Record<string, unknown> {
  return dispatch.metadata && typeof dispatch.metadata === 'object' && !Array.isArray(dispatch.metadata)
    ? (dispatch.metadata as Record<string, unknown>)
    : {}
}

/** Defer sem falha hard: volta a SCHEDULED com novo scheduledAt. */
async function deferDispatch(
  dispatch: OutreachDispatch,
  scheduledAt: Date,
  reason: string,
): Promise<void> {
  await prisma.outreachDispatch.update({
    where: { id: dispatch.id },
    data: {
      status: 'SCHEDULED',
      lockedAt: null,
      scheduledAt,
      metadata: {
        ...metaOf(dispatch),
        lastDeferReason: reason,
        lastDeferAt: new Date().toISOString(),
      } as unknown as Prisma.InputJsonValue,
    },
  })
}

async function failDispatch(
  dispatch: DispatchWithRelations,
  params: {
    permanent: boolean
    reasonCode: string
    failReason: string
    smtpResponse?: string
    recordBounce?: boolean
  },
): Promise<void> {
  const now = new Date()
  await prisma.outreachDispatch.update({
    where: { id: dispatch.id },
    data: {
      status: params.permanent ? 'FAILED_PERMANENT' : 'FAILED',
      failedAt: now,
      reasonCode: params.reasonCode,
      failReason: params.failReason.slice(0, 2000),
      smtpResponse: params.smtpResponse?.slice(0, 1000),
    },
  })

  if (params.recordBounce && dispatch.toEmail) {
    // Hard bounce: supressao automatica + ContactEvent BOUNCED (task 10/14).
    const thresholds = await getOutreachThresholds()
    await addSuppression({
      kind: 'EMAIL',
      value: dispatch.toEmail,
      reason: 'BOUNCED',
      source: 'outreach-send',
      cooldownHours: thresholds.emailCooldownHours,
      notes: `dispatch ${dispatch.id}`,
    }).catch(() => undefined)
    const { contactEventId } = await applyOutcome({
      leadId: dispatch.leadId,
      userId: dispatch.userId,
      channel: dispatch.channel,
      outcome: 'BOUNCED',
      dispatchId: dispatch.id,
      metadata: { reasonCode: params.reasonCode, smtpResponse: params.smtpResponse },
    })
    await prisma.outreachDispatch.update({
      where: { id: dispatch.id },
      data: { contactEventId, replyOutcome: 'BOUNCED' },
    })
    await track({
      kind: 'outreach.bounced',
      correlationId: makeCorrelationId('outreach'),
      userId: dispatch.userId,
      resourceType: 'outreach_dispatch',
      resourceId: dispatch.id,
      metadata: { campaignId: dispatch.campaignId, reasonCode: params.reasonCode },
    })
  } else {
    await track({
      kind: 'outreach.failed',
      correlationId: makeCorrelationId('outreach'),
      userId: dispatch.userId,
      resourceType: 'outreach_dispatch',
      resourceId: dispatch.id,
      metadata: {
        campaignId: dispatch.campaignId,
        reasonCode: params.reasonCode,
        permanent: params.permanent,
      },
    })
  }
}

/**
 * Anti-bounce dinamico por dominio (task 14/F-14): bloqueia novos envios ao
 * dominio quando (a) houve bounce recente dentro do cooldown, ou (b) o cap
 * diario por dominio foi atingido.
 */
async function domainGate(
  domain: string,
  now: Date,
): Promise<{ ok: boolean; retryAt?: Date; reason?: string }> {
  const thresholds = await getOutreachThresholds()
  const cooldownStart = new Date(now.getTime() - thresholds.domainCooldownHours * 3600_000)

  const recentBounce = await prisma.outreachDispatch.findFirst({
    where: {
      toDomain: domain,
      replyOutcome: 'BOUNCED',
      updatedAt: { gte: cooldownStart },
    },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  })
  if (recentBounce) {
    const retryAt = new Date(recentBounce.updatedAt.getTime() + thresholds.domainCooldownHours * 3600_000)
    return { ok: false, retryAt, reason: `dominio ${domain} em cooldown pos-bounce` }
  }

  const dayStart = new Date(now.getTime() - 24 * 3600_000)
  const sentToday = await prisma.outreachDispatch.count({
    where: { toDomain: domain, sentAt: { gte: dayStart }, dryRun: false },
  })
  if (sentToday >= thresholds.domainDailyCap) {
    return {
      ok: false,
      retryAt: new Date(now.getTime() + 12 * 3600_000),
      reason: `cap diario do dominio ${domain} atingido (${sentToday}/${thresholds.domainDailyCap})`,
    }
  }
  return { ok: true }
}

/**
 * Task 13 (F-13): regras de pausa de sequencia para passos > 1 — opt-out,
 * reply (qualquer outcome de resposta) ou sequencia/campanha pausada
 * cancelam o passo em vez de enviar.
 */
async function sequencePauseGate(
  dispatch: DispatchWithRelations,
): Promise<{ proceed: boolean; reason?: string }> {
  if (dispatch.sequenceStep <= 1) return { proceed: true }

  if (dispatch.campaign.sequenceId) {
    const sequence = await prisma.outreachSequence.findUnique({
      where: { id: dispatch.campaign.sequenceId },
      select: { isActive: true, pausedAt: true },
    })
    if (!sequence?.isActive || sequence.pausedAt) {
      return { proceed: false, reason: 'sequencia pausada/inativa' }
    }
  }

  const replyEvent = await prisma.contactEvent.findFirst({
    where: {
      leadId: dispatch.leadId,
      outcome: {
        in: ['INTERESTED', 'REJECTED', 'ANSWERED', 'SCHEDULED', 'OPT_OUT', 'FORWARDED', 'AMBIGUOUS'],
      },
    },
    select: { id: true, outcome: true },
  })
  if (replyEvent) {
    return { proceed: false, reason: `lead respondeu (${replyEvent.outcome}) — sequencia interrompida` }
  }
  return { proceed: true }
}

/** Render minimalista de template ({{campo}}) com dados do lead. */
export function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key]
    return v === null || v === undefined ? '' : String(v)
  })
}

export async function runOutreachSend(payload: unknown): Promise<void> {
  // Poison gate (task 03): payload estruturalmente invalido nao re-tenta.
  const dispatchId =
    payload && typeof payload === 'object' && typeof (payload as { dispatchId?: unknown }).dispatchId === 'string'
      ? (payload as { dispatchId: string }).dispatchId
      : null
  if (!dispatchId) {
    throw new PoisonPayloadError(`payload de outreach-send invalido: ${JSON.stringify(payload).slice(0, 200)}`)
  }

  const dispatch = (await prisma.outreachDispatch.findUnique({
    where: { id: dispatchId },
    include: { campaign: true, mailbox: true },
  })) as DispatchWithRelations | null
  if (!dispatch) {
    throw new PoisonPayloadError(`dispatch ${dispatchId} inexistente`)
  }

  // Idempotencia/claim-conflict: so SCHEDULED e claimavel. Qualquer outro
  // estado = ja processado/em processamento por outra replica — no-op.
  if (dispatch.status !== 'SCHEDULED') return

  // Agendado para o futuro? Defer silencioso (scheduler re-enfileira).
  const now = new Date()
  if (dispatch.scheduledAt > now) return

  // ── CLAIM transacional (task 08): SCHEDULED -> LOCKED guarded ──────────
  const claimed = await prisma.outreachDispatch.updateMany({
    where: { id: dispatch.id, status: 'SCHEDULED' },
    data: { status: 'LOCKED', lockedAt: now },
  })
  if (claimed.count === 0) return // outra replica claimou — sem duplicacao

  try {
    // ── Reconciliacao 9.1 (task 09): divergencia bloqueia atualizacao ─────
    const consistency = await checkLeadEventConsistency(dispatch.leadId)
    if (!consistency.consistent) {
      await deferDispatch(dispatch, new Date(now.getTime() + 3600_000), `divergencia lead/evento: ${consistency.detail}`)
      const { claimAlertSlot } = await import('@/lib/alerts/dedup')
      await claimAlertSlot('outreach-lead-divergence', { leadId: dispatch.leadId, detail: consistency.detail }, now, {
        severity: 'high',
        message: `Divergencia Lead.status vs ContactEvent no lead ${dispatch.leadId} — atualizacoes bloqueadas ate reconciliacao`,
      }).catch(() => undefined)
      return
    }

    // ── Pausa de sequencia (task 13) ──────────────────────────────────────
    const pause = await sequencePauseGate(dispatch)
    if (!pause.proceed) {
      await prisma.outreachDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: 'CANCELLED',
          reasonCode: 'suppression',
          failReason: pause.reason,
        },
      })
      await track({
        kind: 'outreach.sequence_paused',
        correlationId: makeCorrelationId('outreach'),
        userId: dispatch.userId,
        resourceType: 'outreach_dispatch',
        resourceId: dispatch.id,
        metadata: { reason: pause.reason, step: dispatch.sequenceStep },
      })
      return
    }

    // ── Preflight (task 01): kill-switch, aprovacao, mercado, caixa ───────
    const mailbox = dispatch.mailbox
    const preflight = await checkOutboundPreconditions({
      campaign: dispatch.campaign,
      mailbox,
      userId: dispatch.userId,
      correlationId: `dispatch-${dispatch.id}`,
    })
    if (!preflight.allowed) {
      // Sem falha hard: volta para SCHEDULED; quando os gates abrirem o
      // scheduler re-enfileira. Task 11: kill switch desligado => nada sai.
      await deferDispatch(dispatch, new Date(now.getTime() + 30 * 60_000), preflight.reasons.join('; '))
      return
    }

    if (!mailbox) {
      await failDispatch(dispatch, {
        permanent: false,
        reasonCode: 'provider',
        failReason: 'dispatch sem caixa atribuida',
      })
      return
    }

    // ── Janela de envio + gap + jitter (task 11) ──────────────────────────
    const windowSpec = {
      start: mailbox.sendWindowStart,
      end: mailbox.sendWindowEnd,
      timezone: mailbox.timezone,
    }
    if (!isWithinSendWindow(windowSpec, now)) {
      const sendAt = computeSendAt({
        window: windowSpec,
        lastSentAt: mailbox.lastSentAt,
        minGapSeconds: mailbox.minGapSeconds,
        jitterSeconds: mailbox.jitterSeconds,
        jitterKey: dispatch.replayToken,
        now,
      })
      await deferDispatch(dispatch, sendAt, 'fora da janela de envio da caixa')
      return
    }
    // Gap minimo entre envios da mesma caixa.
    if (mailbox.lastSentAt && now.getTime() - mailbox.lastSentAt.getTime() < mailbox.minGapSeconds * 1000) {
      const sendAt = computeSendAt({
        window: windowSpec,
        lastSentAt: mailbox.lastSentAt,
        minGapSeconds: mailbox.minGapSeconds,
        jitterSeconds: mailbox.jitterSeconds,
        jitterKey: dispatch.replayToken,
        now,
      })
      await deferDispatch(dispatch, sendAt, 'gap minimo da caixa')
      return
    }

    // ── Destinatario valido (task 19 hard-check) ──────────────────────────
    const toEmail = dispatch.toEmail?.trim().toLowerCase() ?? null
    if (!toEmail || !EMAIL_SHAPE.test(toEmail)) {
      await failDispatch(dispatch, {
        permanent: true,
        reasonCode: 'validation',
        failReason: `destinatario invalido: ${toEmail ?? '(vazio)'}`,
      })
      return
    }

    // ── Supressao (task 10): SEMPRE antes do dispatch ─────────────────────
    const suppression = await checkSuppression(toEmail, now)
    const dryRun = preflight.dryRun || !suppression.available || dispatch.dryRun
    if (suppression.suppressed) {
      const outcome = suppression.reason === 'BOUNCED' ? 'BOUNCED' : 'OPT_OUT'
      const { contactEventId } = await applyOutcome({
        leadId: dispatch.leadId,
        userId: dispatch.userId,
        channel: dispatch.channel,
        outcome,
        dispatchId: dispatch.id,
        metadata: {
          suppressed: true,
          suppressionKind: suppression.kind,
          suppressionReason: suppression.reason,
        },
      })
      await prisma.outreachDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: 'SUPPRESSED',
          reasonCode: 'suppression',
          failReason: `endereco/dominio suprimido (${suppression.reason})`,
          contactEventId,
        },
      })
      await track({
        kind: 'outreach.suppressed',
        correlationId: makeCorrelationId('outreach'),
        userId: dispatch.userId,
        resourceType: 'outreach_dispatch',
        resourceId: dispatch.id,
        metadata: { suppressionReason: suppression.reason, suppressionKind: suppression.kind },
      })
      return
    }

    // ── Anti-bounce por dominio (task 14) ─────────────────────────────────
    const domain = dispatch.toDomain ?? toEmail.split('@')[1]
    const gate = await domainGate(domain, now)
    if (!gate.ok) {
      await deferDispatch(dispatch, gate.retryAt ?? new Date(now.getTime() + 3600_000), gate.reason ?? 'gate de dominio')
      return
    }

    // ── Conteudo (sequencia + variante A/B) ───────────────────────────────
    const lead = await prisma.lead.findUnique({
      where: { id: dispatch.leadId },
      select: {
        businessName: true,
        city: true,
        state: true,
        niche: true,
        pitchContent: true,
        website: true,
        opportunities: true,
        signals: true,
      },
    })
    if (!lead) {
      await failDispatch(dispatch, {
        permanent: true,
        reasonCode: 'validation',
        failReason: 'lead inexistente',
      })
      return
    }

    let subject = dispatch.subject ?? ''
    let body = ''
    if (dispatch.campaign.sequenceId) {
      const step = await prisma.outreachSequenceStep.findFirst({
        where: {
          sequenceId: dispatch.campaign.sequenceId,
          stepOrder: dispatch.sequenceStep,
          channel: dispatch.channel,
        },
      })
      if (step) {
        subject = subject || step.subjectTemplate || ''
        body = step.bodyTemplate
      }
    }
    // Variante A/B (task 26): override de subject/body por variante.
    const abConfig = dispatch.campaign.abConfig as
      | { variants?: Array<{ key: string; subject?: string; body?: string }> }
      | null
    if (dispatch.abVariant && abConfig?.variants) {
      const variant = abConfig.variants.find((v) => v.key === dispatch.abVariant)
      if (variant) {
        subject = variant.subject ?? subject
        body = variant.body ?? body
      }
    }

    // ── Geracao do email com "o problema" (pitch-bridge) ──────────────────
    // O corpo default e o pitch ciente do gap digital do lead. Se o corpo
    // dependeria do pitch (sem template estatico ou template usando {{pitch}})
    // e o lead ainda nao tem pitch, geramos AGORA (lazy, cacheado 24h). LLM
    // indisponivel => PitchUnavailableError (transitorio) => defer, NUNCA
    // envia corpo vazio/generico.
    const needsPitch = !body.trim() || /\{\{\s*pitch\s*\}\}/.test(`${subject}\n${body}`)
    let pitchContent = lead.pitchContent
    if (needsPitch) {
      try {
        const ensured = await ensureLeadPitch(
          dispatch.leadId,
          { userId: dispatch.userId, tone: 'formal', correlationId: `dispatch-${dispatch.id}` },
          now,
        )
        pitchContent = ensured.content
      } catch (err) {
        // LLM fora do ar = transitorio => adia (retoma quando volta).
        if (err instanceof PitchUnavailableError) {
          await deferDispatch(dispatch, new Date(now.getTime() + 30 * 60_000), `pitch indisponivel (LLM): ${err.message}`)
          return
        }
        // Pitch rejeitado pela anti-alucinacao = permanente (deterministico).
        // Falha hard => revisao humana, NUNCA loop de defer.
        if (err instanceof PitchRejectedError) {
          await failDispatch(dispatch, {
            permanent: true,
            reasonCode: 'validation',
            failReason: `pitch impossivel de gerar automaticamente — revisao humana: ${err.issues.join('; ')}`,
          })
          return
        }
        throw err
      }
    }

    if (!body) body = pitchContent ?? ''
    // Vars de envio: as técnicas (legado) + as AMIGÁVEIS dos pitch templates
    // (empresa/cidade/segmento/problema) + o perfil do remetente ({{meu_*}}).
    const sender = await getSenderProfile()
    const vars = {
      businessName: lead.businessName,
      city: lead.city,
      state: lead.state,
      niche: lead.niche,
      website: lead.website,
      pitch: pitchContent,
      ...buildLeadVars(lead),
      ...buildSenderVars(sender),
    }
    subject = renderTemplate(subject || 'Contato — {{businessName}}', vars).slice(0, 500)
    body = renderTemplate(body, vars)
    if (!body.trim()) {
      // So chega aqui se needsPitch=false e o template resolveu vazio — defeito
      // de configuracao da sequencia, nao do lead.
      await failDispatch(dispatch, {
        permanent: true,
        reasonCode: 'validation',
        failReason: 'corpo de mensagem vazio (template da sequencia sem conteudo)',
      })
      return
    }

    // ── LOCKED -> SENDING ─────────────────────────────────────────────────
    await prisma.outreachDispatch.update({
      where: { id: dispatch.id },
      data: { status: 'SENDING', subject, dryRun },
    })

    // Canais nao-email (task 18): transporte ainda nao habilitado — fica
    // explicito, nunca silencioso.
    if (dispatch.channel !== 'EMAIL') {
      await failDispatch(dispatch, {
        permanent: true,
        reasonCode: 'provider',
        failReason: `canal ${dispatch.channel} sem transporte habilitado (F-18 — fallback de canal requerido)`,
      })
      return
    }

    let messageId: string
    let smtpResponse: string
    if (dryRun) {
      messageId = `dry-run-${dispatch.replayToken}`
      smtpResponse = 'DRY_RUN'
    } else {
      const smtpConfig = mailbox ? toSmtpConfig(mailbox) : null
      if (!smtpConfig) {
        await failDispatch(dispatch, {
          permanent: false,
          reasonCode: 'auth',
          failReason: 'credencial SMTP da caixa ausente ou nao-decryptavel',
        })
        return
      }
      try {
        const result = await sendViaSmtp(smtpConfig, {
          to: toEmail,
          subject,
          text: body,
          messageIdSeed: dispatch.replayToken,
        })
        messageId = result.messageId
        smtpResponse = result.smtpResponse
      } catch (err) {
        const coded = err instanceof CodedError ? err : new CodedError(String(err), { reasonCode: 'network' })
        if (coded.permanent) {
          const isBounce = coded.reasonCode === 'suppression'
          await failDispatch(dispatch, {
            permanent: true,
            reasonCode: coded.reasonCode,
            failReason: coded.message,
            recordBounce: isBounce,
          })
          if (coded.reasonCode === 'auth' && mailbox) {
            await markMailboxUnhealthy(mailbox.id, 'falha de autenticacao SMTP')
          }
          return
        }
        // Erro de rede com envio em estado desconhecido => AMBIGUOUS.
        // NUNCA re-enviar cego (double-send, risco 3 do fonte): exige replay
        // explicito com replayToken (task 13/F-22).
        const { contactEventId } = await applyOutcome({
          leadId: dispatch.leadId,
          userId: dispatch.userId,
          channel: dispatch.channel,
          outcome: 'AMBIGUOUS',
          dispatchId: dispatch.id,
          metadata: { reasonCode: coded.reasonCode, error: coded.message.slice(0, 500) },
        })
        await prisma.outreachDispatch.update({
          where: { id: dispatch.id },
          data: {
            status: 'AMBIGUOUS',
            reasonCode: coded.reasonCode,
            failReason: coded.message.slice(0, 2000),
            contactEventId,
          },
        })
        await track({
          kind: 'outreach.failed',
          correlationId: makeCorrelationId('outreach'),
          userId: dispatch.userId,
          resourceType: 'outreach_dispatch',
          resourceId: dispatch.id,
          metadata: { ambiguous: true, reasonCode: coded.reasonCode },
        })
        return
      }
    }

    // ── Sucesso: SENT + ContactEvent + Lead NEW->CONTACTED (task 09) ──────
    const sentAt = new Date()
    const { contactEventId } = await applyOutcome({
      leadId: dispatch.leadId,
      userId: dispatch.userId,
      channel: dispatch.channel,
      outcome: 'SENT',
      dispatchId: dispatch.id,
      metadata: { messageId, smtpResponse, dryRun, abVariant: dispatch.abVariant, step: dispatch.sequenceStep },
      now: sentAt,
    })
    await prisma.outreachDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'SENT',
        sentAt,
        messageId: messageId.slice(0, 500),
        smtpResponse: smtpResponse.slice(0, 1000),
        contactEventId,
        dryRun,
      },
    })
    if (!dryRun && mailbox) {
      await prisma.outreachMailbox.update({
        where: { id: mailbox.id },
        data: { lastSentAt: sentAt },
      })
    }
    await track({
      kind: 'outreach.sent',
      correlationId: makeCorrelationId('outreach'),
      userId: dispatch.userId,
      resourceType: 'outreach_dispatch',
      resourceId: dispatch.id,
      metadata: {
        campaignId: dispatch.campaignId,
        step: dispatch.sequenceStep,
        dryRun,
        abVariant: dispatch.abVariant,
      },
    })

    // ── Proximo passo da sequencia SO apos resultado deste (task 08) ──────
    await scheduleNextSequenceStep(dispatch, sentAt).catch(() => undefined)
  } catch (err) {
    // Falha inesperada com claim em maos: re-agenda (ate o limite) para nao
    // deixar dispatch LOCKED orfao (Zero Estados Indefinidos).
    const meta = metaOf(dispatch)
    const attempts = Number(meta.workerAttempts ?? 0) + 1
    if (attempts >= MAX_DISPATCH_ATTEMPTS) {
      await failDispatch(dispatch, {
        permanent: true,
        reasonCode: 'unknown',
        failReason: `falha apos ${attempts} tentativas: ${err instanceof Error ? err.message : String(err)}`,
      })
    } else {
      await prisma.outreachDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: 'SCHEDULED',
          lockedAt: null,
          scheduledAt: new Date(Date.now() + 10 * 60_000),
          metadata: { ...meta, workerAttempts: attempts } as unknown as Prisma.InputJsonValue,
        },
      })
    }
    throw err
  }
}

/**
 * Agenda o passo N+1 da sequencia: cria o dispatch SCHEDULED com
 * scheduledAt = sentAt + waitHours do passo seguinte. O gate de pausa
 * (sequencePauseGate) re-valida na hora do envio — reply/opt-out cancela.
 */
async function scheduleNextSequenceStep(
  dispatch: DispatchWithRelations,
  sentAt: Date,
): Promise<void> {
  if (!dispatch.campaign.sequenceId) return
  const nextStep = await prisma.outreachSequenceStep.findFirst({
    where: {
      sequenceId: dispatch.campaign.sequenceId,
      stepOrder: dispatch.sequenceStep + 1,
      channel: dispatch.channel,
    },
  })
  if (!nextStep) return

  const scheduledAt = new Date(sentAt.getTime() + nextStep.waitHours * 3600_000)
  try {
    await prisma.outreachDispatch.create({
      data: {
        campaignId: dispatch.campaignId,
        leadId: dispatch.leadId,
        userId: dispatch.userId,
        mailboxId: dispatch.mailboxId,
        sequenceStep: nextStep.stepOrder,
        channel: dispatch.channel,
        status: 'SCHEDULED',
        priority: dispatch.priority,
        toEmail: dispatch.toEmail,
        toDomain: dispatch.toDomain,
        // subject do proximo passo vem do subjectTemplate dele; se ausente, o
        // worker aplica o default no envio. Nao herdar o subject deste passo
        // (era especifico da 1a mensagem).
        subject: nextStep.subjectTemplate ?? null,
        abVariant: dispatch.abVariant,
        replayToken: `${dispatch.replayToken.split('#')[0]}#s${nextStep.stepOrder}`,
        scheduledAt,
        dryRun: dispatch.dryRun,
      },
    })
  } catch (err) {
    // P2002 (replayToken ou partial unique de ativo) = passo ja agendado —
    // idempotente, sem duplicacao.
    if ((err as { code?: string }).code !== 'P2002') throw err
  }
}
