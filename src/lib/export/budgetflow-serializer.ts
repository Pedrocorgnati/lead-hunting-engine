import type { Lead } from '@prisma/client'

/**
 * BudgetFlow Serializer
 * =====================
 *
 * Mapeia um Lead (prisma) para o schema canonico BudgetFlow v1.
 * Schema pensado para ser importado pela ferramenta externa BudgetFlow
 * (geracao de orcamentos a partir de oportunidades identificadas).
 *
 * ## LGPD
 *
 * Campos PII/internos NAO sao exportados:
 *   - userId, jobId (ids internos)
 *   - scoreBreakdown (logica interna de scoring)
 *   - pitchContent, pitchTone (conteudo gerado, nao faz parte do payload B2B)
 *   - enrichmentData (dados brutos de enrichment, pode conter PII)
 *   - falsePositiveReason (metadata interna)
 *   - retentionUntil, contactedAt (dados de pipeline interno)
 *   - phoneNormalized (duplicado de phone)
 *   - email (PII direta — operador deve enviar manualmente se necessario)
 *
 * ## Schema exportado (BudgetFlowPayload v1)
 *
 * ```jsonc
 * {
 *   "version": "1",
 *   "source": "lead-hunting-engine",
 *   "exportedAt": "2026-04-18T12:34:56.000Z",
 *   "lead": {
 *     "externalId": "<uuid do lead no origem>",
 *     "business": {
 *       "name": "Pizzaria Da Nonna",
 *       "category": "Restaurante",
 *       "website": "https://...",
 *       "phone": "+55 11 9xxxx-xxxx",
 *       "address": { "line": "Rua X 123", "city": "Sao Paulo", "state": "SP" },
 *       "location": { "lat": null, "lng": null }   // omitido se ausente
 *     },
 *     "opportunity": {
 *       "score": 87,                    // 0-100 publico (sem breakdown)
 *       "temperature": "HOT",
 *       "types": ["WEBSITE_BROKEN","INACTIVE_SOCIAL"],
 *       "problems": ["Site retornando 500"],
 *       "suggestions": ["Refazer site responsivo"]
 *     },
 *     "social": {
 *       "instagram": { "handle": "...", "followers": 1200 } | null,
 *       "facebook":  { "url": "...",    "followers": 800  } | null
 *     },
 *     "presence": {
 *       "rating": 4.3,
 *       "reviewCount": 128
 *     },
 *     "discoveredAt": "2026-04-17T20:12:00.000Z"
 *   }
 * }
 * ```
 *
 * ## Exemplo
 *
 * ```ts
 * const payload = serializeBudgetFlow(lead)
 * // payload.version === '1'
 * // payload.lead.business.name === lead.businessName
 * // 'internalScore' in payload.lead === false
 * ```
 */

export const BUDGETFLOW_VERSION = '1' as const

export interface BudgetFlowBusiness {
  name: string
  category: string | null
  website: string | null
  phone: string | null
  address: {
    line: string | null
    city: string | null
    state: string | null
  }
}

export interface BudgetFlowOpportunity {
  score: number
  temperature: string
  types: string[]
  problems: string[]
  suggestions: string[]
}

export interface BudgetFlowSocial {
  instagram: { handle: string; followers: number | null } | null
  facebook: { url: string; followers: number | null } | null
}

export interface BudgetFlowPresence {
  rating: number | null
  reviewCount: number | null
}

export interface BudgetFlowLead {
  externalId: string
  business: BudgetFlowBusiness
  opportunity: BudgetFlowOpportunity
  social: BudgetFlowSocial
  presence: BudgetFlowPresence
  discoveredAt: string
}

export interface BudgetFlowPayload {
  version: typeof BUDGETFLOW_VERSION
  source: 'lead-hunting-engine'
  exportedAt: string
  lead: BudgetFlowLead
}

/**
 * Converte `Lead` para o payload canonico BudgetFlow.
 * @param lead Lead carregado do Prisma
 * @returns payload sem campos internos/PII sensivel
 */
export function serializeBudgetFlow(lead: Lead): BudgetFlowPayload {
  const social: BudgetFlowSocial = {
    instagram: lead.instagramHandle
      ? { handle: lead.instagramHandle, followers: lead.instagramFollowers ?? null }
      : null,
    facebook: lead.facebookUrl
      ? { url: lead.facebookUrl, followers: lead.facebookFollowers ?? null }
      : null,
  }

  const rating = lead.rating === null || lead.rating === undefined
    ? null
    : Number(lead.rating)

  return {
    version: BUDGETFLOW_VERSION,
    source: 'lead-hunting-engine',
    exportedAt: new Date().toISOString(),
    lead: {
      externalId: lead.id,
      business: {
        name: lead.businessName,
        category: lead.category,
        website: lead.website,
        phone: lead.phone,
        address: {
          line: lead.address,
          city: lead.city,
          state: lead.state,
        },
      },
      opportunity: {
        score: lead.score,
        temperature: lead.temperature,
        types: [...lead.opportunities],
        problems: [...lead.problems],
        suggestions: [...lead.suggestions],
      },
      social,
      presence: {
        rating,
        reviewCount: lead.reviewCount ?? null,
      },
      discoveredAt: lead.createdAt.toISOString(),
    },
  }
}
