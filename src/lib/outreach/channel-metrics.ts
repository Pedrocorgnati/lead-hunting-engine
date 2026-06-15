/**
 * channel-metrics — metricas de canal SEM maquiagem (blacksmith 06-11, Task 5;
 * criterios 17 e 19 do doc da feature).
 *
 * Funcoes PURAS (sem banco, sem rede): derivam fatos de canal a partir dos
 * campos do lead ja carregados pelo caller. Quatro conceitos que NUNCA podem
 * ser misturados em UI/metrica (criterio 17):
 *  - "e-mail encontrado"  (hasEmail): existe string de e-mail no lead;
 *  - "e-mail util"        (hasUsefulEmail): forma valida + hardValid do
 *    computeIntegrityScore — e o gate real de envio, independente do score;
 *  - "canal detectado"    (detectedChannels): ha evidencia CONFIRMADA do canal;
 *  - "canal enviavel"     (sendableChannels): detectado E com transporte real
 *    (CHANNELS_WITH_TRANSPORT do channel-orchestrator — fonte unica, nao
 *    duplicada aqui). Enquanto so EMAIL tiver transporte, WhatsApp/LinkedIn
 *    jamais aparecem como enviaveis, mesmo detectados.
 *
 * Regra inviolavel (criterio 19): nivel 'probable' de WhatsApp NUNCA conta
 * como canal detectado-confirmado — ele aparece SOMENTE em `whatsappLevel`.
 * LinkedIn hoje nao tem fonte confiavel de sinal (doc Task 5: "se existir
 * fonte confiavel"), entao nunca e marcado como detectado — listar LinkedIn
 * para todo lead seria exatamente a maquiagem que esta task elimina.
 */

import type { OutreachChannel } from '@prisma/client'
import {
  CHANNELS_WITH_TRANSPORT,
  DEFAULT_CHANNEL_PRIORITY,
} from '@/lib/outreach/channel-orchestrator'
import { toE164 } from '@/lib/outreach/phone-utils'
import {
  readWhatsappEnrichment,
  type WhatsappSignalLevel,
} from '@/lib/intelligence/enrichment/enrichment-data'
import { classifyBRPhone } from '@/lib/intelligence/enrichment/enrichers/phone-classifier'
import { computeIntegrityScore } from '@/lib/intelligence/quality/integrity-score'

/** Reexport do contrato canonico (enrichment-data.ts) para os consumidores de UI. */
export type WhatsappLevel = WhatsappSignalLevel

export interface WhatsappLevelInput {
  isWhatsappChannel?: boolean | null
  phoneNormalized?: string | null
  enrichmentData?: unknown
}

export interface ChannelFactsInput extends WhatsappLevelInput {
  email?: string | null
  website?: string | null
  /**
   * Score persistido (Lead.integrityScore). Aceito por conveniencia de
   * espalhar o lead inteiro, mas NAO e usado: `hasUsefulEmail` recomputa o
   * hardValid da forma do e-mail — score numerico velho nao vira "e-mail util".
   */
  integrityScore?: number | null
}

export interface ChannelFacts {
  hasEmail: boolean
  hasUsefulEmail: boolean
  whatsappLevel: WhatsappLevel
  detectedChannels: string[]
  bestDetectedChannel: string | null
  sendableChannels: string[]
  bestSendableChannel: string | null
}

/**
 * Resolve o nivel do sinal WhatsApp de um lead. Prioridade:
 *  1. bloco canonico `enrichmentData.whatsapp` (readWhatsappEnrichment) —
 *     fonte da verdade quando a pipeline nova ja gravou o nivel;
 *  2. fallback legado: `isWhatsappChannel === true` => 'confirmed' (flag
 *     historica derivada de evidencia de HTML pelo detector);
 *  3. fallback por classificador: celular BR valido => 'probable';
 *  4. 'unknown' (fixo, numero invalido/ausente, nao-BR) — fail-closed.
 */
export function resolveWhatsappLevel(lead: WhatsappLevelInput): WhatsappLevel {
  const block = readWhatsappEnrichment(lead.enrichmentData)
  if (block) return block.level
  if (lead.isWhatsappChannel === true) return 'confirmed'
  if (classifyBRPhone(lead.phoneNormalized) === 'mobile') return 'probable'
  return 'unknown'
}

/**
 * Deriva os fatos de canal do lead, separando detectado de enviavel.
 *
 * Deteccao por canal (ordem de DEFAULT_CHANNEL_PRIORITY):
 *  - EMAIL: qualquer e-mail presente (encontrado != util — criterio 17);
 *  - WHATSAPP: SOMENTE nivel 'confirmed' ('probable' fica em whatsappLevel);
 *  - LINKEDIN: nunca (sem fonte confiavel de sinal hoje).
 *
 * Enviavel = detectado + transporte em CHANNELS_WITH_TRANSPORT; para EMAIL
 * exige tambem `hasUsefulEmail` (gate hardValid do integrity-score) — e-mail
 * malformado e "encontrado", mas nao e canal de envio honesto.
 */
export function computeChannelFacts(lead: ChannelFactsInput): ChannelFacts {
  const hasEmail = typeof lead.email === 'string' && lead.email.trim().length > 0
  const integrity = computeIntegrityScore({
    email: lead.email,
    website: lead.website,
    phoneNormalized: lead.phoneNormalized,
  })
  const hasUsefulEmail = hasEmail && integrity.hardValid
  const whatsappLevel = resolveWhatsappLevel(lead)

  const detectedByChannel: Record<OutreachChannel, boolean> = {
    EMAIL: hasEmail,
    WHATSAPP: whatsappLevel === 'confirmed',
    LINKEDIN: false,
  }

  const detectedChannels = DEFAULT_CHANNEL_PRIORITY.filter((c) => detectedByChannel[c])
  const sendableChannels = detectedChannels.filter(
    (c) => CHANNELS_WITH_TRANSPORT.includes(c) && (c !== 'EMAIL' || hasUsefulEmail),
  )

  return {
    hasEmail,
    hasUsefulEmail,
    whatsappLevel,
    detectedChannels,
    bestDetectedChannel: detectedChannels[0] ?? null,
    sendableChannels,
    bestSendableChannel: sendableChannels[0] ?? null,
  }
}

/** Linha minima de lead para a cobertura agregada (select leve do caller). */
export interface ChannelCoverageRow extends ChannelFactsInput {
  /** Telefone cru (Lead.phone) — fallback de phoneNormalized em lead legado. */
  phone?: string | null
}

/**
 * Cobertura agregada de canais (review 06-11 R1-1/R1-2): contadores SEM
 * maquiagem para a lista de leads — substitui a metrica antiga 'com WhatsApp'
 * que contava celular BR (nivel 'probable') sem qualificador, violando a
 * regra inviolavel do criterio 19.
 */
export interface ChannelCoverageSummary {
  withPhone: number
  /** Nivel 'confirmed' (evidencia de HTML) — o UNICO que pode ser exibido como WhatsApp. */
  withWhatsappConfirmed: number
  /** Nivel 'probable' (celular BR) — SEMPRE exibido com o qualificador 'provavel'. */
  withWhatsappProbable: number
  withEmail: number
  /** E-mail util (forma valida + hardValid) — o gate real de envio (criterio 17). */
  withUsefulEmail: number
}

/**
 * Agrega computeChannelFacts sobre as linhas filtradas da lista de leads.
 * Lead legado sem phoneNormalized usa toE164(phone) como fallback (mesma
 * tolerancia da metrica antiga — sem isso a migracao para niveis esconderia
 * leads 'probable' que a UI ja contava).
 */
export function summarizeChannelCoverage(rows: readonly ChannelCoverageRow[]): ChannelCoverageSummary {
  const summary: ChannelCoverageSummary = {
    withPhone: 0,
    withWhatsappConfirmed: 0,
    withWhatsappProbable: 0,
    withEmail: 0,
    withUsefulEmail: 0,
  }
  for (const row of rows) {
    const facts = computeChannelFacts({
      ...row,
      phoneNormalized: row.phoneNormalized ?? toE164(row.phone),
    })
    if (typeof row.phone === 'string' && row.phone.trim().length > 0) summary.withPhone++
    if (facts.whatsappLevel === 'confirmed') summary.withWhatsappConfirmed++
    if (facts.whatsappLevel === 'probable') summary.withWhatsappProbable++
    if (facts.hasEmail) summary.withEmail++
    if (facts.hasUsefulEmail) summary.withUsefulEmail++
  }
  return summary
}
