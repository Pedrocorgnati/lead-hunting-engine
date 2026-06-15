import 'server-only'

/**
 * outreach-engine (brainstorm 06-10, task 18 — F-18): orquestrador multicanal.
 * Mantem Lead.status UNICO por lead; cada canal grava ContactEvent proprio.
 * Regras de prioridade e pausa entre canais evitam sobrecontato.
 *
 * Pre-requisitos respeitados (regra 8.1 do fonte — 18 por ultimo): a prova de
 * idempotencia e o controle de double-send vivem no OutreachDispatch (partial
 * unique (lead_id, channel) WHERE status ativo + replayToken unico). Este
 * modulo NAO reimplementa envio: decide CANAL e ELEGIBILIDADE, e delega ao
 * dispatch existente. Email e o unico canal com transporte real hoje;
 * WhatsApp/LinkedIn ficam EXPLICITAMENTE pendentes de transporte (Zero
 * Orfaos: nenhum canal "ativado" sem caminho de execucao).
 */
import { prisma } from '@/lib/prisma'
import type { OutreachChannel } from '@prisma/client'

/** Canais com transporte real implementado. WhatsApp/LinkedIn = roadmap. */
export const CHANNELS_WITH_TRANSPORT: OutreachChannel[] = ['EMAIL']

/**
 * Prioridade de canal (menor index = preferido). Fallback percorre na ordem
 * o proximo canal elegivel quando o preferido nao esta disponivel.
 */
export const DEFAULT_CHANNEL_PRIORITY: OutreachChannel[] = ['EMAIL', 'WHATSAPP', 'LINKEDIN']

/** Janela minima entre contatos de QUALQUER canal para o mesmo lead (anti sobrecontato). */
const MIN_CROSS_CHANNEL_GAP_HOURS = 24

export interface ChannelDecision {
  channel: OutreachChannel | null
  reason: string
  transportReady: boolean
}

/**
 * Decide o canal a usar para o proximo contato de um lead, respeitando:
 *  (1) anti-sobrecontato: se houve contato em QUALQUER canal nas ultimas 24h,
 *      nao agenda novo (retorna channel=null);
 *  (2) prioridade configuravel com fallback ao proximo canal elegivel;
 *  (3) transporte: so retorna canal com transporte pronto (transportReady).
 *
 * `lead.email` decide elegibilidade de EMAIL; WhatsApp/LinkedIn elegiveis por
 * sinais (isWhatsappChannel) mas sem transporte => transportReady=false.
 */
export async function decideChannel(
  leadId: string,
  options: { priority?: OutreachChannel[]; now?: Date } = {},
): Promise<ChannelDecision> {
  const now = options.now ?? new Date()
  const priority = options.priority ?? DEFAULT_CHANNEL_PRIORITY

  // (1) Anti-sobrecontato cross-canal.
  const recentContact = await prisma.contactEvent.findFirst({
    where: {
      leadId,
      outcome: { in: ['SENT', 'ANSWERED', 'INTERESTED', 'NO_ANSWER'] },
      createdAt: { gte: new Date(now.getTime() - MIN_CROSS_CHANNEL_GAP_HOURS * 3600_000) },
    },
    select: { id: true, channel: true },
  })
  if (recentContact) {
    return { channel: null, reason: `contato recente (<${MIN_CROSS_CHANNEL_GAP_HOURS}h) no canal ${recentContact.channel} — evita sobrecontato`, transportReady: false }
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { email: true, isWhatsappChannel: true },
  })
  if (!lead) return { channel: null, reason: 'lead inexistente', transportReady: false }

  for (const channel of priority) {
    const eligible =
      channel === 'EMAIL'
        ? Boolean(lead.email)
        : channel === 'WHATSAPP'
        ? lead.isWhatsappChannel === true
        : true // LINKEDIN: elegivel por padrao (sinal especifico fora de escopo)
    if (!eligible) continue
    // Sem dispatch ativo nesse canal (respeita partial-unique).
    const active = await prisma.outreachDispatch.findFirst({
      where: { leadId, channel, status: { in: ['SCHEDULED', 'LOCKED', 'SENDING'] } },
      select: { id: true },
    })
    if (active) continue
    const transportReady = CHANNELS_WITH_TRANSPORT.includes(channel)
    return {
      channel,
      reason: transportReady
        ? `canal ${channel} elegivel`
        : `canal ${channel} elegivel mas SEM transporte (roadmap F-18) — requer fallback`,
      transportReady,
    }
  }
  return { channel: null, reason: 'nenhum canal elegivel sem dispatch ativo', transportReady: false }
}

/**
 * Resolve o canal efetivo aplicando fallback: se o canal preferido nao tem
 * transporte, percorre a prioridade ate achar um com transporte pronto.
 * Garante que nenhum lote multicanal "ative" um canal sem caminho de envio.
 */
export async function resolveSendableChannel(
  leadId: string,
  options: { priority?: OutreachChannel[]; now?: Date } = {},
): Promise<ChannelDecision> {
  const priority = (options.priority ?? DEFAULT_CHANNEL_PRIORITY).filter((c) =>
    CHANNELS_WITH_TRANSPORT.includes(c),
  )
  return decideChannel(leadId, { ...options, priority })
}
