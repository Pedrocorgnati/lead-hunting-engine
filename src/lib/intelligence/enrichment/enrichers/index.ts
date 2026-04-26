/**
 * Barrel + orquestrador dos enrichers detalhados — TASK-5 intake-review.
 *
 * Os enrichers aqui sao COMPLEMENTARES aos stages existentes
 * (stage-website, stage-reviews, etc). Enquanto os stages calculam
 * SCORES 0-100 a partir de dados ja coletados, estes enrichers fazem
 * chamadas externas (PageSpeed, SerpAPI, Meta Ads, Google Places)
 * para PERFIL DETALHADO — persistido nos campos siteAudit, googleReviews,
 * serpRank, adsStatus, techStack.
 *
 * Tolerante a falha: cada enricher ja engloba try/catch e retorna
 * { skipped | error } sem lancar.
 */

import { auditSite } from './site-audit'
import { fetchReviews } from './google-reviews'
import { fetchSerpRank } from './serp-rank'
import { detectAds } from './ads-detector'

export { auditSite } from './site-audit'
export { fetchReviews } from './google-reviews'
export { fetchSerpRank, checkRank } from './serp-rank'
export { detectAds } from './ads-detector'
export { trackLeadChanges, diffLead, getHistory, recordHistory } from './history-tracker'
export {
  GENERIC_EMAIL_PREFIXES,
  isGenericEmail,
  prioritizeEmails,
  prioritizeEmailsByDomain,
} from './email-prioritizer'
export type { PrioritizedEmails } from './email-prioritizer'
export {
  discoverEmails,
  extractEmailCandidatesFromHtml,
  extractEmailsFromRawJson,
} from './email-discovery'
export type { EmailDiscoveryInput, EmailDiscoveryResult } from './email-discovery'

export interface DetailedEnrichmentInput {
  website?: string | null
  placeId?: string | null
  niche?: string | null
  city?: string | null
  facebookPageId?: string | null
}

export interface DetailedEnrichmentOutput {
  siteAudit: Awaited<ReturnType<typeof auditSite>>
  googleReviews: Awaited<ReturnType<typeof fetchReviews>>
  serpRank: Awaited<ReturnType<typeof fetchSerpRank>>
  adsStatus: Awaited<ReturnType<typeof detectAds>>
  techStack: string[]
  enrichedAt: string
}

/**
 * Executa todos os 4 enrichers em paralelo. Nunca lanca.
 * Resultado serve para persistir nos campos `siteAudit`, `googleReviews`,
 * `serpRank`, `adsStatus`, `techStack` do Lead.
 */
export async function runDetailedEnrichment(
  input: DetailedEnrichmentInput,
): Promise<DetailedEnrichmentOutput> {
  const [siteAudit, googleReviews, serpRank, adsStatus] = await Promise.all([
    auditSite(input.website),
    fetchReviews(input.placeId),
    fetchSerpRank(input.website, input.niche, input.city),
    detectAds({ facebookPageId: input.facebookPageId, website: input.website }),
  ])

  return {
    siteAudit,
    googleReviews,
    serpRank,
    adsStatus,
    techStack: siteAudit.techStack ?? [],
    enrichedAt: new Date().toISOString(),
  }
}
