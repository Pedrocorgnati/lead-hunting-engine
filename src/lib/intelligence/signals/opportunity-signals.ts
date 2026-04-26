/**
 * Opportunity Signals catalog — TASK-4 intake-review (CL-063..CL-068)
 *
 * Catalogo de sinais granulares de oportunidade comercial.
 * Cada sinal tem slug, label em pt-BR, descricao e trigger puro.
 *
 * Os sinais NAO substituem o score ponderado — complementam, expondo
 * por QUE o lead e oportunidade. Rastreados em Lead.signals[].
 */

import type { EnrichedLeadData } from '../enrichment/types'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

export type OpportunitySignalSlug =
  | 'site-bad-or-absent'
  | 'whatsapp-manual'
  | 'reviews-without-structure'
  | 'strong-ig-weak-site'
  | 'improvised-ecommerce'
  | 'low-automation'

export interface SignalContext {
  enriched: EnrichedLeadData
  raw?: Pick<RawLeadInput, 'siteReachable' | 'siteMobileFriendly' | 'instagramFollowers' | 'rawJson'> | null
}

export interface OpportunitySignalDefinition {
  slug: OpportunitySignalSlug
  label_ptBR: string
  description: string
  trigger: (ctx: SignalContext) => boolean
}

function toBool(value: unknown): boolean | null {
  if (value === true) return true
  if (value === false) return false
  return null
}

export const OPPORTUNITY_SIGNALS: OpportunitySignalDefinition[] = [
  {
    slug: 'site-bad-or-absent',
    label_ptBR: 'Site ruim ou inexistente',
    description: 'Negocio sem site, sem SSL ou nao otimizado para mobile — oportunidade clara de venda de site.',
    trigger: ({ enriched, raw }) => {
      if (!enriched.website) return true
      const hasSsl = enriched.website.startsWith('https://')
      const reachable = raw?.siteReachable ?? true
      const mobile = raw?.siteMobileFriendly ?? true
      return !reachable || !hasSsl || !mobile
    },
  },
  {
    slug: 'whatsapp-manual',
    label_ptBR: 'WhatsApp manual como canal principal',
    description: 'Atende clientes majoritariamente via WhatsApp sem automacao — oportunidade de vender automacao de atendimento.',
    trigger: ({ enriched }) => enriched.isWhatsappChannel === true,
  },
  {
    slug: 'reviews-without-structure',
    label_ptBR: 'Muitos reviews sem estrutura digital',
    description: 'Volume relevante de reviews mas sem site funcional ou e-commerce — oportunidade de profissionalizar o canal digital.',
    trigger: ({ enriched, raw }) => {
      const rj = (raw?.rawJson ?? {}) as Record<string, unknown>
      const reviewCount = typeof rj.reviewCount === 'number' ? rj.reviewCount : 0
      const reachable = raw?.siteReachable ?? false
      return reviewCount >= 200 && (!reachable || enriched.hasEcommerce === false)
    },
  },
  {
    slug: 'strong-ig-weak-site',
    label_ptBR: 'Instagram forte + site fraco',
    description: 'Base de seguidores relevante no Instagram mas site ausente ou inacessivel — oportunidade de capturar essa audiencia em canal proprio.',
    trigger: ({ raw }) => {
      const followers = raw?.instagramFollowers ?? 0
      const reachable = raw?.siteReachable ?? true
      return followers >= 10_000 && !reachable
    },
  },
  {
    slug: 'improvised-ecommerce',
    label_ptBR: 'E-commerce improvisado',
    description: 'Menciona vendas online mas sem plataforma de e-commerce estruturada — oportunidade de implantar loja profissional.',
    trigger: ({ enriched, raw }) => {
      if (enriched.hasEcommerce !== false) return false
      const rj = (raw?.rawJson ?? {}) as Record<string, unknown>
      const siteHtml = typeof rj.siteHtml === 'string' ? rj.siteHtml : typeof rj.html === 'string' ? rj.html : ''
      const igBio = typeof rj.instagramBio === 'string' ? rj.instagramBio : ''
      const salesMention = /vendas\s+online|encomendas|compre\s+(aqui|pelo)|pedidos\s+(pelo|via)/i
      return salesMention.test(siteHtml) || salesMention.test(igBio)
    },
  },
  {
    slug: 'low-automation',
    label_ptBR: 'Baixa automacao operacional',
    description: 'Sem painel administrativo, CRM ou agendamento online — oportunidade de vender sistemas internos.',
    trigger: ({ enriched, raw }) => {
      const rj = (raw?.rawJson ?? {}) as Record<string, unknown>
      const hasAdmin = toBool(rj.hasAdminPanel) === true
      const hasCrm = toBool(rj.hasCrm) === true
      const hasBooking = toBool(rj.hasOnlineBooking) === true
      const maturityLow = enriched.scores.businessMaturity < 40
      return !hasAdmin && !hasCrm && !hasBooking && maturityLow
    },
  },
]

/**
 * Avalia todos os sinais para um lead enriquecido. Retorna somente os slugs disparados.
 * Seguro contra erros individuais — isola cada trigger.
 */
export function evaluateOpportunitySignals(ctx: SignalContext): OpportunitySignalSlug[] {
  const fired: OpportunitySignalSlug[] = []
  for (const def of OPPORTUNITY_SIGNALS) {
    try {
      if (def.trigger(ctx)) fired.push(def.slug)
    } catch {
      // Nunca quebrar por falha de avaliacao isolada
    }
  }
  return fired
}

export function getSignalDefinition(slug: string): OpportunitySignalDefinition | null {
  return OPPORTUNITY_SIGNALS.find((s) => s.slug === slug) ?? null
}
