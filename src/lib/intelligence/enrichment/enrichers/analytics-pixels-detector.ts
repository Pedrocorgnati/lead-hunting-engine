/**
 * Analytics/Pixels detector — TASK-3 intake-review (CL-060)
 *
 * Enumera pixels e tags de analytics presentes no HTML.
 * Puro, sem chamadas externas.
 */

export type AnalyticsPixel = 'ga4' | 'ga-universal' | 'meta' | 'tiktok' | 'hotjar' | 'gtm' | 'clarity' | 'linkedin'

export interface AnalyticsPixelsInput {
  html?: string | null
}

export interface AnalyticsPixelsResult {
  analyticsPixels: AnalyticsPixel[]
  evidence: Record<AnalyticsPixel, string | null>
}

const PIXEL_PATTERNS: Array<{ id: AnalyticsPixel; re: RegExp }> = [
  { id: 'ga4', re: /gtag\s*\(\s*['"]config['"]\s*,\s*['"]G-[A-Z0-9]+['"]/i },
  { id: 'ga-universal', re: /UA-\d{4,}-\d+/i },
  { id: 'meta', re: /fbq\s*\(\s*['"]init['"]|connect\.facebook\.net\/[a-z_]+\/fbevents\.js/i },
  { id: 'tiktok', re: /ttq\.load\s*\(|analytics\.tiktok\.com\/i18n\/pixel/i },
  { id: 'hotjar', re: /static\.hotjar\.com|hjid\s*:\s*\d+/i },
  { id: 'gtm', re: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i },
  { id: 'clarity', re: /clarity\.ms\/tag|clarity\(\s*["']set/i },
  { id: 'linkedin', re: /snap\.licdn\.com\/li\.lms-analytics/i },
]

export function detectAnalyticsPixels(input: AnalyticsPixelsInput): AnalyticsPixelsResult {
  const html = input.html ?? ''
  const found: AnalyticsPixel[] = []
  const evidence: Record<AnalyticsPixel, string | null> = {
    ga4: null,
    'ga-universal': null,
    meta: null,
    tiktok: null,
    hotjar: null,
    gtm: null,
    clarity: null,
    linkedin: null,
  }

  if (!html) return { analyticsPixels: [], evidence }

  for (const { id, re } of PIXEL_PATTERNS) {
    const match = html.match(re)
    if (match) {
      found.push(id)
      evidence[id] = match[0].slice(0, 80)
    }
  }

  return { analyticsPixels: found, evidence }
}
