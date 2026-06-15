import 'server-only'

/**
 * outreach-engine (brainstorm 06-10, task 12 — F-12): sync IMAP de respostas
 * por caixa. Kind 'outreach-reply-sync', payload { mailboxId, syncSlot }.
 *
 * Fluxo por mensagem nao-lida:
 *  1. bounce (DSN)? -> supressao + ContactEvent BOUNCED no dispatch original.
 *  2. casa com dispatch SENT (In-Reply-To = Message-ID do envio, fallback
 *     por remetente == toEmail)? -> classifica texto (parser puro) ->
 *     ContactEvent + transicao automatica guardada; AMBIGUOUS vai para
 *     revisao humana (alerta), nunca transiciona sozinho.
 *  3. opt-out -> supressao UNSUBSCRIBED imediata.
 *
 * PII: corpo de inbox NUNCA vai para log/telemetria cru — apenas outcome e
 * padroes casados (maskFreeText nos trechos).
 */
import { prisma } from '@/lib/prisma'
import { CodedError, PoisonPayloadError } from './reason-codes'
import { classifyInboundReply, looksLikeBounce } from '@/lib/outreach/inbound-parser'
import { applyOutcome } from '@/lib/outreach/lead-status-bridge'
import { addSuppression, normalizeEmail } from '@/lib/outreach/suppression'
import { maskFreeText } from '@/lib/pii-mask'
import { decryptMailboxPassword } from '@/lib/outreach/mailbox-service'
import { getOutreachThresholds } from '@/lib/services/system-config'
import { track, makeCorrelationId } from '@/lib/telemetry'
import type { Prisma } from '@prisma/client'

interface ParsedInbound {
  fromAddress: string | null
  subject: string
  text: string
  inReplyTo: string | null
}

export interface ReplySyncResult {
  processed: number
  matched: number
  bounces: number
  optOuts: number
  ambiguous: number
}

export async function runOutreachReplySync(payload: unknown): Promise<ReplySyncResult> {
  const mailboxId =
    payload && typeof payload === 'object' && typeof (payload as { mailboxId?: unknown }).mailboxId === 'string'
      ? (payload as { mailboxId: string }).mailboxId
      : null
  if (!mailboxId) {
    throw new PoisonPayloadError(`payload de outreach-reply-sync invalido`)
  }

  const mailbox = await prisma.outreachMailbox.findUnique({ where: { id: mailboxId } })
  if (!mailbox) throw new PoisonPayloadError(`mailbox ${mailboxId} inexistente`)
  if (!mailbox.imapHost) {
    // Caixa sem IMAP configurado: nada a sincronizar (nao e erro).
    return { processed: 0, matched: 0, bounces: 0, optOuts: 0, ambiguous: 0 }
  }
  const password = decryptMailboxPassword(mailbox)
  if (!password) {
    throw new CodedError('credencial IMAP nao-decryptavel', { reasonCode: 'auth', permanent: true })
  }

  let messages: ParsedInbound[]
  try {
    messages = await fetchUnseenMessages({
      host: mailbox.imapHost,
      port: mailbox.imapPort ?? 993,
      user: mailbox.username,
      pass: password,
    })
  } catch (err) {
    throw new CodedError(
      `falha de sync IMAP: ${err instanceof Error ? err.message : String(err)}`,
      { reasonCode: 'inbox_parse', cause: err },
    )
  }

  const result: ReplySyncResult = { processed: 0, matched: 0, bounces: 0, optOuts: 0, ambiguous: 0 }
  for (const message of messages) {
    result.processed += 1
    try {
      await processInboundMessage(mailbox.id, message, result)
    } catch {
      // Mensagem individual com falha nao derruba o batch (Zero Silencio:
      // o contador de processed vs matched expoe a diferenca).
    }
  }

  await prisma.outreachMailbox.update({
    where: { id: mailbox.id },
    data: { lastInboundSyncAt: new Date() },
  })
  return result
}

async function processInboundMessage(
  mailboxId: string,
  message: ParsedInbound,
  result: ReplySyncResult,
): Promise<void> {
  // 1. Tenta casar com dispatch SENT: In-Reply-To primeiro, remetente depois.
  const from = message.fromAddress ? normalizeEmail(message.fromAddress) : null
  let dispatch =
    message.inReplyTo !== null
      ? await prisma.outreachDispatch.findFirst({
          where: { messageId: { contains: message.inReplyTo.replace(/[<>]/g, '') }, status: 'SENT' },
          orderBy: { sentAt: 'desc' },
        })
      : null
  if (!dispatch && from) {
    dispatch = await prisma.outreachDispatch.findFirst({
      where: { toEmail: from, status: 'SENT' },
      orderBy: { sentAt: 'desc' },
    })
  }

  // 2. Bounce report (DSN do mailer-daemon).
  if (looksLikeBounce(message.subject, message.text)) {
    result.bounces += 1
    const bouncedAddress = dispatch?.toEmail ?? extractBouncedAddress(message.text)
    if (bouncedAddress) {
      const thresholds = await getOutreachThresholds()
      await addSuppression({
        kind: 'EMAIL',
        value: bouncedAddress,
        reason: 'BOUNCED',
        source: 'inbound-dsn',
        cooldownHours: thresholds.emailCooldownHours,
      }).catch(() => undefined)
    }
    if (dispatch) {
      const { contactEventId } = await applyOutcome({
        leadId: dispatch.leadId,
        userId: dispatch.userId,
        channel: dispatch.channel,
        outcome: 'BOUNCED',
        dispatchId: dispatch.id,
        metadata: { source: 'inbound-dsn' },
      })
      await prisma.outreachDispatch.update({
        where: { id: dispatch.id },
        data: { replyOutcome: 'BOUNCED', repliedAt: new Date(), contactEventId },
      })
      await track({
        kind: 'outreach.bounced',
        correlationId: makeCorrelationId('inbound'),
        userId: dispatch.userId,
        resourceType: 'outreach_dispatch',
        resourceId: dispatch.id,
        metadata: { source: 'inbound-dsn' },
      }).catch(() => undefined)
    }
    return
  }

  if (!dispatch) return // inbound sem dispatch correspondente: fora do escopo

  result.matched += 1
  const classification = classifyInboundReply(message.text, message.subject)

  if (classification.outcome === 'OPT_OUT') {
    result.optOuts += 1
    if (dispatch.toEmail) {
      await addSuppression({
        kind: 'EMAIL',
        value: dispatch.toEmail,
        reason: 'UNSUBSCRIBED',
        source: 'inbound-reply',
      }).catch(() => undefined)
    }
  }
  if (classification.outcome === 'AMBIGUOUS') {
    result.ambiguous += 1
    const { claimAlertSlot } = await import('@/lib/alerts/dedup')
    await claimAlertSlot(
      'outreach-ambiguous-reply',
      { dispatchId: dispatch.id, leadId: dispatch.leadId },
      new Date(),
      {
        severity: 'medium',
        message: `Resposta ambigua no lead ${dispatch.leadId} — revisao humana necessaria`,
      },
    ).catch(() => undefined)
  }

  // ContactEvent + transicao automatica guardada (AMBIGUOUS/FORWARDED/
  // OUT_OF_OFFICE tem targetStatus null no mapa => apenas revisao humana).
  const { contactEventId } = await applyOutcome({
    leadId: dispatch.leadId,
    userId: dispatch.userId,
    channel: dispatch.channel,
    outcome: classification.outcome,
    dispatchId: dispatch.id,
    metadata: {
      source: 'inbound-reply',
      confidence: classification.confidence,
      // PII: o trecho casado pode conter dados do remetente (email/telefone no
      // corpo) — mascara antes de persistir (contrato do header do arquivo).
      matchedPattern: classification.matchedPattern ? maskFreeText(classification.matchedPattern) : undefined,
    },
  })
  await prisma.outreachDispatch.update({
    where: { id: dispatch.id },
    data: {
      replyOutcome: classification.outcome,
      repliedAt: new Date(),
      contactEventId,
      metadata: {
        ...(dispatch.metadata && typeof dispatch.metadata === 'object' && !Array.isArray(dispatch.metadata)
          ? (dispatch.metadata as Record<string, unknown>)
          : {}),
        inboundConfidence: classification.confidence,
      } as unknown as Prisma.InputJsonValue,
    },
  })
  await track({
    kind: 'outreach.reply_received',
    correlationId: makeCorrelationId('inbound'),
    userId: dispatch.userId,
    resourceType: 'outreach_dispatch',
    resourceId: dispatch.id,
    metadata: { outcome: classification.outcome, confidence: classification.confidence },
  }).catch(() => undefined)
}

function extractBouncedAddress(text: string): string | null {
  const m = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text)
  return m ? normalizeEmail(m[0]) : null
}

/** IO IMAP isolado (imapflow + mailparser, imports dinamicos). */
async function fetchUnseenMessages(config: {
  host: string
  port: number
  user: string
  pass: string
}): Promise<ParsedInbound[]> {
  const { ImapFlow } = await import('imapflow')
  const { simpleParser } = await import('mailparser')

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  })

  const messages: ParsedInbound[] = []
  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      const uids = await client.search({ seen: false })
      const list = Array.isArray(uids) ? uids.slice(0, 50) : []
      for (const uid of list) {
        const raw = await client.download(String(uid))
        if (!raw?.content) continue
        const parsed = await simpleParser(raw.content)
        messages.push({
          fromAddress: parsed.from?.value?.[0]?.address ?? null,
          subject: parsed.subject ?? '',
          text: parsed.text ?? '',
          inReplyTo: parsed.inReplyTo ?? null,
        })
        await client.messageFlagsAdd(String(uid), ['\\Seen'])
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => undefined)
  }
  return messages
}
