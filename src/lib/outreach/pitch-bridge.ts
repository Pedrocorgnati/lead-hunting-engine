import 'server-only'

/**
 * outreach-engine (brainstorm 06-10): ponte que garante que o email outbound
 * carregue "o problema" do lead. O pitch (copy ciente do gap digital) e gerado
 * pelo mesmo motor LLM da rota /leads/[id]/pitch e gravado em Lead.pitchContent.
 *
 * Sem isto, o worker de envio mandaria leads recem-coletados (pitchContent
 * null) com corpo vazio — a "geracao do email com o problema" ficaria fora do
 * fluxo automatico. Aqui o pitch e gerado lazy no momento do envio (e cacheado
 * 24h, mesma politica da rota), de forma idempotente.
 *
 * Falha de LLM NAO produz email generico: o chamador (worker) trata
 * PitchUnavailableError como erro transitorio (reason_code 'provider') e
 * adia o dispatch — nunca envia sem o problema.
 */
import { prisma } from '@/lib/prisma'
import { generatePitch, HallucinatedPitchError } from '@/lib/pitch/pitch-generator'
import { LLMUnavailableError } from '@/lib/pitch/llm-client'
import { PITCH_CACHE_TTL_MS } from '@/lib/pitch/constants'
import { getSignalDefinition } from '@/lib/intelligence/signals/opportunity-signals'
import { CodedError } from '@/lib/workers/reason-codes'

/** Slugs de sinal -> rotulos pt-BR (o problema concreto do lead). */
export function signalsToLabels(signals: string[] | null | undefined): string[] {
  return (signals ?? [])
    .map((s) => getSignalDefinition(s)?.label_ptBR)
    .filter((l): l is string => Boolean(l))
}

/** LLM fora do ar agora — TRANSITORIO, adiar envio (retoma quando o LLM volta). */
export class PitchUnavailableError extends CodedError {
  constructor(message: string, cause?: unknown) {
    super(message, { reasonCode: 'provider', permanent: false, cause })
    this.name = 'PitchUnavailableError'
  }
}

/**
 * Pitch rejeitado pela anti-alucinacao — PERMANENTE. validatePitch e
 * deterministico (mesmo lead+prompt => mesmas issues), entao reagendar a cada
 * 30min seria loop infinito (Zero Estados Indefinidos). Falha hard => revisao
 * humana (operador escreve um pitch manual via PitchCard).
 */
export class PitchRejectedError extends CodedError {
  readonly issues: string[]
  constructor(message: string, issues: string[], cause?: unknown) {
    super(message, { reasonCode: 'validation', permanent: true, cause })
    this.name = 'PitchRejectedError'
    this.issues = issues
  }
}

export interface EnsuredPitch {
  content: string
  tone: string
  generated: boolean
}

/**
 * Garante pitch fresco para o lead. Reusa pitchContent se valido (<24h);
 * senao gera via LLM e persiste. Lanca PitchUnavailableError (transitorio) se
 * o LLM falhar ou o pitch for rejeitado pela anti-alucinacao — o envio
 * NUNCA prossegue com corpo vazio/generico.
 */
export async function ensureLeadPitch(
  leadId: string,
  opts: { userId: string; tone?: string; correlationId?: string },
  now: Date = new Date(),
): Promise<EnsuredPitch> {
  const tone = opts.tone ?? 'formal'
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      businessName: true,
      category: true,
      city: true,
      state: true,
      phone: true,
      website: true,
      rating: true,
      reviewCount: true,
      score: true,
      scoreBreakdown: true,
      opportunities: true,
      signals: true,
      problems: true,
      isWhatsappChannel: true,
      hasEcommerce: true,
      pitchContent: true,
      pitchTone: true,
      updatedAt: true,
    },
  })
  if (!lead) {
    throw new CodedError(`lead ${leadId} inexistente para geracao de pitch`, {
      reasonCode: 'validation',
      permanent: true,
    })
  }

  // Cache: mesmo tom + atualizado nas ultimas 24h (mesma politica da rota).
  const cacheValid =
    lead.pitchTone === tone &&
    !!lead.pitchContent &&
    lead.updatedAt.getTime() >= now.getTime() - PITCH_CACHE_TTL_MS
  if (cacheValid && lead.pitchContent) {
    return { content: lead.pitchContent, tone, generated: false }
  }

  const breakdown = (lead.scoreBreakdown as Record<string, { score?: number }>) ?? {}
  const digitalGapScore = breakdown.digital_gap?.score ?? lead.score ?? 50
  const opportunityLabel = String(lead.opportunities?.[0] ?? 'C')

  try {
    const result = await generatePitch(
      {
        businessName: lead.businessName,
        category: lead.category,
        city: lead.city,
        state: lead.state,
        phone: lead.phone,
        website: lead.website,
        rating: lead.rating ? Number(lead.rating) : null,
        reviewCount: lead.reviewCount,
        digitalGapScore,
        opportunityLabel,
        scoreBreakdown: breakdown,
        // O PROBLEMA REAL identificado no enriquecimento (fix da revisao).
        signalLabels: signalsToLabels(lead.signals),
        problems: lead.problems,
        isWhatsappChannel: lead.isWhatsappChannel,
        hasEcommerce: lead.hasEcommerce,
      },
      tone as never,
      {
        operation: 'outreach.pitch.generate',
        userId: opts.userId,
        leadId,
        jobId: null,
        correlationId: opts.correlationId ?? null,
      },
    )
    await prisma.lead.update({
      where: { id: leadId },
      data: { pitchContent: result.pitch, pitchTone: tone },
    })
    return { content: result.pitch, tone, generated: true }
  } catch (err) {
    if (err instanceof LLMUnavailableError) {
      throw new PitchUnavailableError(`LLM indisponivel para gerar pitch do lead ${leadId}`, err)
    }
    if (err instanceof HallucinatedPitchError) {
      throw new PitchRejectedError(
        `pitch rejeitado pela anti-alucinacao (lead ${leadId}): ${err.issues.join('; ')}`,
        err.issues,
        err,
      )
    }
    throw err
  }
}
