import 'server-only'

/**
 * outreach-engine (brainstorm 06-10, tasks 01/08): despacho canonico do
 * envio outbound. NENHUM call-site enfileira 'outreach-send' direto — todo
 * envio passa por aqui, e aqui o preflight (kill-switch, supressao, dry-run,
 * aprovacao de campanha, gate de mercado, saude de caixa) roda como `gate`
 * do dispatchJob ANTES de qualquer enfileiramento.
 *
 * Payload carrega o dispatchId (unico) — a idempotencia da fila por
 * (kind, payloadHash) entao deduplica re-enfileiramentos do MESMO dispatch
 * sem nunca colapsar dispatches distintos.
 */
import { prisma } from '@/lib/prisma'
import { dispatchJob, type DispatchResult } from './dispatcher'
import { checkOutboundPreconditions } from '@/lib/outreach/preflight'
import { track, makeCorrelationId } from '@/lib/telemetry'

export interface OutreachSendDispatchPayload {
  dispatchId: string
}

export async function dispatchOutreachSend(
  payload: OutreachSendDispatchPayload,
): Promise<DispatchResult> {
  const dispatch = await prisma.outreachDispatch.findUnique({
    where: { id: payload.dispatchId },
    include: { campaign: true, mailbox: true },
  })

  const result = await dispatchJob({
    kind: 'outreach-send',
    payload: payload as OutreachSendDispatchPayload & Record<string, never>,
    gate: async () => {
      if (!dispatch) {
        return { allowed: false, reasons: [`dispatch ${payload.dispatchId} inexistente`] }
      }
      const preflight = await checkOutboundPreconditions({
        campaign: dispatch.campaign,
        mailbox: dispatch.mailbox,
        userId: dispatch.userId,
        correlationId: `enqueue-${dispatch.id}`,
      })
      // DRY_RUN nao bloqueia o enfileiramento — o worker envia simulado.
      return { allowed: preflight.allowed, reasons: preflight.reasons }
    },
  })

  await track({
    kind: 'outreach.dispatched',
    correlationId: makeCorrelationId('outreach'),
    userId: dispatch?.userId ?? null,
    resourceType: 'outreach_dispatch',
    resourceId: payload.dispatchId,
    metadata: {
      mode: result.mode,
      ...(result.blockedReasons ? { blockedReasons: result.blockedReasons } : {}),
    },
  }).catch(() => undefined)

  return result
}

/** Despacho do sync de respostas inbound (task 12) — payload por caixa. */
export async function dispatchOutreachReplySync(payload: {
  mailboxId: string
  /** Discriminador para permitir re-sync periodico (idempotencia por hora). */
  syncSlot: string
}): Promise<DispatchResult> {
  return dispatchJob({
    kind: 'outreach-reply-sync',
    payload: payload as { mailboxId: string; syncSlot: string } & Record<string, never>,
  })
}
