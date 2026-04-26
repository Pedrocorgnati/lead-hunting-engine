/**
 * Site audit enricher — TASK-5 intake-review (CL-057, CL-058, CL-062)
 *
 * Combina:
 *  - PageSpeed Insights (lighthouseScore)                    [requer GOOGLE_PAGESPEED_API_KEY]
 *  - Parse heuristico de HTML (ano no footer, links quebrados)
 *  - Deteccao de tech stack via headers + meta tags          [funciona sem API key]
 *
 * NUNCA lanca: retorna { error } no lugar.
 */

export interface SiteAuditResult {
  lighthouseScore: number | null // 0-100 (performance)
  outdatedYear: number | null
  brokenLinksCount: number | null
  techStack: string[]
  checkedAt: string
  skipped?: boolean
  error?: string
}

const PAGESPEED_ENDPOINT =
  'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

function detectTechFromHeaders(headers: Headers): string[] {
  const stack = new Set<string>()
  const server = headers.get('server')?.toLowerCase() ?? ''
  const xPowered = headers.get('x-powered-by')?.toLowerCase() ?? ''
  const xShopId = headers.get('x-shopid')
  const xShopifyStage = headers.get('x-shopify-stage')
  const xWix = headers.get('x-wix-request-id')

  if (server.includes('cloudflare')) stack.add('Cloudflare')
  if (server.includes('nginx')) stack.add('Nginx')
  if (server.includes('apache')) stack.add('Apache')
  if (xPowered.includes('wordpress')) stack.add('WordPress')
  if (xPowered.includes('php')) stack.add('PHP')
  if (xPowered.includes('next')) stack.add('Next.js')
  if (xPowered.includes('express')) stack.add('Express')
  if (xShopId || xShopifyStage) stack.add('Shopify')
  if (xWix) stack.add('Wix')
  return [...stack]
}

function detectTechFromHtml(html: string, url: string): string[] {
  const stack = new Set<string>()
  const lower = html.toLowerCase()
  if (url.includes('wixsite.com') || lower.includes('wix.com')) stack.add('Wix')
  if (lower.includes('cdn.shopify.com') || lower.includes('shopify.theme')) stack.add('Shopify')
  if (lower.includes('wp-content/') || lower.includes('wp-includes/')) stack.add('WordPress')
  if (lower.includes('_next/static')) stack.add('Next.js')
  if (lower.includes('static.squarespace.com')) stack.add('Squarespace')
  if (lower.includes('static.parastorage.com')) stack.add('Wix')
  if (lower.includes('cdn.webflow.com')) stack.add('Webflow')
  if (lower.includes('googletagmanager.com')) stack.add('Google Tag Manager')
  if (lower.includes('google-analytics.com') || lower.includes('gtag')) stack.add('Google Analytics')
  if (lower.includes('connect.facebook.net')) stack.add('Meta Pixel')
  return [...stack]
}

function extractFooterYear(html: string): number | null {
  const footerMatch = html.match(/<footer[\s\S]*?<\/footer>/i)
  const scope = footerMatch ? footerMatch[0] : html.slice(-4000)
  const years = [...scope.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => parseInt(m[0], 10))
  if (years.length === 0) return null
  return Math.max(...years)
}

async function fetchSiteHtml(url: string, timeoutMs = 8000): Promise<{ html: string; headers: Headers } | null> {
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LeadHuntingEngine-SiteAudit/1.0' },
    })
    clearTimeout(to)
    if (!res.ok) return { html: '', headers: res.headers }
    const html = await res.text()
    return { html, headers: res.headers }
  } catch {
    return null
  }
}

async function checkLinkStatus(href: string, timeoutMs = 4000): Promise<number | null> {
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(href, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal })
    clearTimeout(to)
    return res.status
  } catch {
    return null
  }
}

async function countBrokenLinks(html: string, baseUrl: string, sampleSize = 10): Promise<number> {
  try {
    const hrefs = [...html.matchAll(/<a\s+[^>]*href="([^"#]+)"/gi)]
      .map((m) => m[1])
      .filter((h) => h.startsWith('http'))
    const unique = [...new Set(hrefs)].slice(0, sampleSize)
    let broken = 0
    await Promise.all(
      unique.map(async (h) => {
        const status = await checkLinkStatus(h)
        if (status !== null && status >= 400) broken++
      }),
    )
    return broken
  } catch {
    return 0
  }
}

async function runPageSpeed(url: string, apiKey: string): Promise<number | null> {
  try {
    const endpoint = `${PAGESPEED_ENDPOINT}?url=${encodeURIComponent(url)}&key=${apiKey}&strategy=mobile`
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 20000)
    const res = await fetch(endpoint, { signal: ctrl.signal })
    clearTimeout(to)
    if (!res.ok) return null
    const json = (await res.json()) as {
      lighthouseResult?: { categories?: { performance?: { score?: number } } }
    }
    const score = json.lighthouseResult?.categories?.performance?.score
    return typeof score === 'number' ? Math.round(score * 100) : null
  } catch {
    return null
  }
}

export async function auditSite(url: string | null | undefined): Promise<SiteAuditResult> {
  const base: SiteAuditResult = {
    lighthouseScore: null,
    outdatedYear: null,
    brokenLinksCount: null,
    techStack: [],
    checkedAt: new Date().toISOString(),
  }

  try {
    if (!url) return { ...base, skipped: true, error: 'no-url' }

    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY
    if (!apiKey) {
      // eslint-disable-next-line no-console
      console.warn('[site-audit] PageSpeed skipped: missing GOOGLE_PAGESPEED_API_KEY — configure in .env')
    }

    const [fetched, lighthouseScore] = await Promise.all([
      fetchSiteHtml(url),
      apiKey ? runPageSpeed(url, apiKey) : Promise.resolve(null),
    ])

    if (!fetched) return { ...base, lighthouseScore, error: 'site-unreachable' }

    const { html, headers } = fetched
    const techStack = [...new Set([...detectTechFromHeaders(headers), ...detectTechFromHtml(html, url)])]
    const outdatedYear = extractFooterYear(html)
    const brokenLinksCount = html ? await countBrokenLinks(html, url) : null

    return {
      lighthouseScore,
      outdatedYear,
      brokenLinksCount,
      techStack,
      checkedAt: base.checkedAt,
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : 'site-audit-failed' }
  }
}
