/**
 * Ads detector enricher — TASK-5 intake-review (CL-061)
 *
 * Meta Ad Library: requer META_ADS_API_KEY (access_token Graph API).
 * Google Ads Transparency: requer GOOGLE_ADS_API_KEY OU scraping headless.
 *
 * Se chaves ausentes, retorna { skipped: true } sem quebrar.
 */

export interface AdsDetectorResult {
  metaActive: boolean | null
  metaAdsCount: number | null
  googleActive: boolean | null
  googleAdsCount: number | null
  fetchedAt: string
  skipped?: boolean
  error?: string
}

const META_AD_LIBRARY_ENDPOINT = 'https://graph.facebook.com/v19.0/ads_archive'

async function checkMetaAds(pageId: string, accessToken: string): Promise<{ active: boolean; count: number } | null> {
  try {
    const params = new URLSearchParams({
      access_token: accessToken,
      ad_reached_countries: '["BR"]',
      ad_active_status: 'ACTIVE',
      search_page_ids: `[${pageId}]`,
      limit: '25',
      fields: 'id',
    })
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 10000)
    const res = await fetch(`${META_AD_LIBRARY_ENDPOINT}?${params.toString()}`, { signal: ctrl.signal })
    clearTimeout(to)
    if (!res.ok) return null
    const json = (await res.json()) as { data?: Array<{ id: string }> }
    const count = json.data?.length ?? 0
    return { active: count > 0, count }
  } catch {
    return null
  }
}

/**
 * Google Ads Transparency Center nao tem API publica oficial.
 * Estrategia: fetch da pagina publica e procurar indicadores.
 * Fallback silencioso — so ativa se GOOGLE_ADS_CHECK_ENABLED=1.
 */
async function checkGoogleAds(domain: string): Promise<{ active: boolean; count: number } | null> {
  const enabled = process.env.GOOGLE_ADS_CHECK_ENABLED === '1'
  if (!enabled) return null
  try {
    const url = `https://adstransparency.google.com/advertiser?domain=${encodeURIComponent(domain)}`
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'LeadHuntingEngine-AdsCheck/1.0' } })
    clearTimeout(to)
    if (!res.ok) return null
    const html = await res.text()
    // Heuristica: procura padrao "N results" ou estruturas conhecidas
    const match = html.match(/"numberOfAds"\s*:\s*(\d+)/)
    if (match) {
      const count = parseInt(match[1], 10)
      return { active: count > 0, count }
    }
    return { active: false, count: 0 }
  } catch {
    return null
  }
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export async function detectAds(input: {
  facebookPageId?: string | null
  website?: string | null
}): Promise<AdsDetectorResult> {
  const base: AdsDetectorResult = {
    metaActive: null,
    metaAdsCount: null,
    googleActive: null,
    googleAdsCount: null,
    fetchedAt: new Date().toISOString(),
  }

  try {
    const metaToken = process.env.META_ADS_API_KEY
    if (!metaToken) {
      // eslint-disable-next-line no-console
      console.warn('[ads-detector] Meta skipped: missing META_ADS_API_KEY — configure in .env')
    }
    if (!process.env.GOOGLE_ADS_API_KEY && process.env.GOOGLE_ADS_CHECK_ENABLED !== '1') {
      // eslint-disable-next-line no-console
      console.warn('[ads-detector] Google skipped: missing GOOGLE_ADS_API_KEY or GOOGLE_ADS_CHECK_ENABLED — configure in .env')
    }

    const tasks: Array<Promise<void>> = []
    const out: AdsDetectorResult = { ...base }

    if (metaToken && input.facebookPageId) {
      tasks.push(
        checkMetaAds(input.facebookPageId, metaToken).then((r) => {
          if (r) {
            out.metaActive = r.active
            out.metaAdsCount = r.count
          }
        }),
      )
    }

    const domain = input.website ? extractDomain(input.website) : null
    if (domain) {
      tasks.push(
        checkGoogleAds(domain).then((r) => {
          if (r) {
            out.googleActive = r.active
            out.googleAdsCount = r.count
          }
        }),
      )
    }

    await Promise.all(tasks)

    const allSkipped = out.metaActive === null && out.googleActive === null
    return allSkipped ? { ...out, skipped: true, error: 'missing-keys-or-ids' } : out
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : 'ads-detector-failed' }
  }
}
