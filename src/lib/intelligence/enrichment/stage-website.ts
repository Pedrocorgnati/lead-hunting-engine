import type { EnrichmentStageResult } from './types'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'
import { discoverEmails } from './enrichers/email-discovery'
import { analyzeUx } from './enrichers/ux-analyzer'

export async function stageWebsitePresence(raw: RawLeadInput): Promise<EnrichmentStageResult> {
  try {
    let score = 0
    const metadata: Record<string, unknown> = {}
    const sources: string[] = ['raw_lead_data']

    // +40: tem website
    if (raw.website) {
      score += 40
      metadata.hasWebsite = true

      // +20: HTTPS
      if (raw.website.startsWith('https://')) {
        score += 20
        metadata.hasSsl = true
      }

      // +20: site acessível (siteReachable do RawLeadData)
      if (raw.siteReachable) {
        score += 20
        metadata.siteReachable = true
      }

      // +20: mobile friendly
      if (raw.siteMobileFriendly) {
        score += 20
        metadata.mobileFriendly = true
      }
    }

    // TASK-1 intake-review (CL-141): heuristica LGPD para emails descobertos.
    // Prefere genericos (contato@, vendas@, sac@) sobre pessoais quando ha
    // multiplos candidatos no mesmo dominio. Nunca quebra o estagio.
    const discovered = discoverEmails({ rawJson: raw.rawJson ?? null })
    if (discovered.primary) {
      metadata.emailPrimary = discovered.primary
      metadata.emailSecondary = discovered.secondary
      for (const s of discovered.sources) {
        if (!sources.includes(s)) sources.push(s)
      }
    }

    // TASK-6 (CL-036): analise profunda de UX a partir do HTML capturado
    const rj = (raw.rawJson ?? {}) as Record<string, unknown>
    const siteHtml =
      typeof rj.siteHtml === 'string'
        ? (rj.siteHtml as string)
        : typeof rj.html === 'string'
          ? (rj.html as string)
          : null
    const siteLoadTimeMs =
      typeof rj.siteLoadTimeMs === 'number'
        ? (rj.siteLoadTimeMs as number)
        : typeof rj.loadTimeMs === 'number'
          ? (rj.loadTimeMs as number)
          : null

    if (siteHtml || siteLoadTimeMs !== null) {
      const ux = analyzeUx({ html: siteHtml, loadTimeMs: siteLoadTimeMs })
      metadata.uxScore = ux.score
      metadata.uxSignals = ux.signals
    }

    return { score: Math.min(score, 100), sources, metadata }
  } catch {
    return { score: 0, sources: [], metadata: { error: 'stage-website-failed' } }
  }
}
