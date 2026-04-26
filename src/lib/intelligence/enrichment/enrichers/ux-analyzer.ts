export interface UxAnalyzerInput {
  html?: string | null
  loadTimeMs?: number | null
}

export interface UxSignals {
  hasCart: boolean
  hasSearch: boolean
  hasContactForm: boolean
  hasBookingWidget: boolean
  hasLiveChat: boolean
  hasClearCTA: boolean
  hasSocialLinks: boolean
  hasAnalyticsPixel: boolean
  pageLoadTimeSec: number | null
}

export interface UxAnalyzerResult {
  score: number
  signals: UxSignals
  matched: string[]
}

const CART_PATTERNS = [
  /\b(adicionar|adicionar ao carrinho|comprar agora|comprar)\b/i,
  /class=["'][^"']*(cart|basket|carrinho|checkout)[^"']*["']/i,
  /\/cart|\/checkout|\/carrinho/i,
  /data-(cart|product)/i,
]
const SEARCH_PATTERNS = [
  /<input[^>]+type=["']search["']/i,
  /<form[^>]*role=["']search["']/i,
  /name=["'](q|search|busca|s)["']/i,
]
const CONTACT_FORM_PATTERNS = [
  /<form[^>]*(contact|contato|fale-conosco)[^>]*>/i,
  /name=["'](email|nome|mensagem|message)["']/i,
  /action=["'][^"']*(contato|contact)[^"']*["']/i,
]
const BOOKING_PATTERNS = [
  /\b(agendar|agende|marcar|reservar|reserva)\b/i,
  /calendly\.com|booksy|agendor|appointlet|agenda\.com/i,
  /class=["'][^"']*(booking|schedul|agenda)[^"']*["']/i,
]
const CHAT_PATTERNS = [
  /tawk\.to|crisp\.chat|intercom|zendesk|livechatinc|jivochat|chat\.olark|hubspot-chat/i,
  /whatsapp\.com\/send|wa\.me\//i,
  /class=["'][^"']*(live-?chat|chatbot)[^"']*["']/i,
]
const CTA_PATTERNS = [
  /<(a|button)[^>]+class=["'][^"']*(btn|button|cta)[^"']*["'][^>]*>[^<]{3,}</i,
  /\b(solicite|peça|orçamento|fale conosco|quero saber|começar agora|entre em contato)\b/i,
]
const SOCIAL_PATTERNS = [
  /(instagram\.com|facebook\.com|fb\.com|linkedin\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com)\//i,
]
const ANALYTICS_PATTERNS = [
  /googletagmanager\.com|google-analytics\.com|gtag\(|fbq\(|connect\.facebook\.net|hotjar|clarity\.ms|plausible|mixpanel/i,
]

function anyMatch(html: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(html))
}

export function analyzeUx(input: UxAnalyzerInput): UxAnalyzerResult {
  const html = typeof input.html === 'string' ? input.html : ''
  const pageLoadTimeSec =
    input.loadTimeMs != null && input.loadTimeMs > 0
      ? Math.round((input.loadTimeMs / 1000) * 100) / 100
      : null

  const signals: UxSignals = {
    hasCart: anyMatch(html, CART_PATTERNS),
    hasSearch: anyMatch(html, SEARCH_PATTERNS),
    hasContactForm: anyMatch(html, CONTACT_FORM_PATTERNS),
    hasBookingWidget: anyMatch(html, BOOKING_PATTERNS),
    hasLiveChat: anyMatch(html, CHAT_PATTERNS),
    hasClearCTA: anyMatch(html, CTA_PATTERNS),
    hasSocialLinks: anyMatch(html, SOCIAL_PATTERNS),
    hasAnalyticsPixel: anyMatch(html, ANALYTICS_PATTERNS),
    pageLoadTimeSec,
  }

  // Score 0-10: cada sinal = 1 ponto, ate 8; load time <= 3s = +1; <= 1.5s = +2
  let score = 0
  if (signals.hasCart) score += 1
  if (signals.hasSearch) score += 1
  if (signals.hasContactForm) score += 1
  if (signals.hasBookingWidget) score += 1
  if (signals.hasLiveChat) score += 1
  if (signals.hasClearCTA) score += 1
  if (signals.hasSocialLinks) score += 1
  if (signals.hasAnalyticsPixel) score += 1
  if (pageLoadTimeSec !== null) {
    if (pageLoadTimeSec <= 1.5) score += 2
    else if (pageLoadTimeSec <= 3) score += 1
  }
  score = Math.min(score, 10)

  const matched = Object.entries(signals)
    .filter(([k, v]) => typeof v === 'boolean' && v && k !== 'pageLoadTimeSec')
    .map(([k]) => k)

  return { score, signals, matched }
}
