/**
 * SERP rank enricher — TASK-5 intake-review (CL-060)
 *
 * Usa SerpAPI (google engine). Requer SERPAPI_KEY.
 * Para cada lead, executa ate 3 keywords (niche + city) e retorna posicao do domain.
 */

export interface SerpRankResult {
  rankings: Array<{ keyword: string; position: number | null }>
  fetchedAt: string
  skipped?: boolean
  error?: string
}

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json'
const MAX_KEYWORDS = 3

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  }
}

export async function checkRank(
  siteDomainOrUrl: string,
  keyword: string,
  location?: string,
): Promise<{ keyword: string; position: number | null }> {
  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) return { keyword, position: null }

  try {
    const params = new URLSearchParams({
      engine: 'google',
      q: keyword,
      api_key: apiKey,
      num: '100',
      hl: 'pt-br',
      gl: 'br',
    })
    if (location) params.set('location', location)

    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 15000)
    const res = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, { signal: ctrl.signal })
    clearTimeout(to)

    if (!res.ok) return { keyword, position: null }

    const json = (await res.json()) as {
      organic_results?: Array<{ position?: number; link?: string }>
    }
    const target = extractDomain(siteDomainOrUrl)
    const match = json.organic_results?.find(
      (r) => typeof r.link === 'string' && extractDomain(r.link) === target,
    )
    return { keyword, position: match?.position ?? null }
  } catch {
    return { keyword, position: null }
  }
}

export async function fetchSerpRank(
  website: string | null | undefined,
  niche: string | null | undefined,
  city: string | null | undefined,
): Promise<SerpRankResult> {
  const base: SerpRankResult = { rankings: [], fetchedAt: new Date().toISOString() }

  try {
    if (!website) return { ...base, skipped: true, error: 'no-website' }

    const apiKey = process.env.SERPAPI_KEY
    if (!apiKey) {
      // eslint-disable-next-line no-console
      console.warn('[serp-rank] skipped: missing SERPAPI_KEY — configure in .env')
      return { ...base, skipped: true, error: 'missing-api-key' }
    }

    // Monta ate 3 keywords deterministicas a partir de niche + city
    const keywords: string[] = []
    if (niche && city) keywords.push(`${niche} ${city}`)
    if (niche) keywords.push(niche)
    if (city && niche) keywords.push(`melhor ${niche} em ${city}`)
    const toCheck = keywords.slice(0, MAX_KEYWORDS)

    if (toCheck.length === 0) return { ...base, skipped: true, error: 'no-keywords' }

    const rankings = await Promise.all(
      toCheck.map((kw) => checkRank(website, kw, city ?? undefined)),
    )

    return { rankings, fetchedAt: base.fetchedAt }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : 'serp-rank-failed' }
  }
}
