/**
 * Fingerprint helpers para requisicoes HTTP diretas.
 *
 * Origem: TASK-12 intake-review / ST003 (CL-193).
 *
 * Complementa `src/lib/workers/providers/anti-bot.ts`, que foca em Playwright
 * (BrowserContext). Este modulo expoe primitivas puras (UA / viewport /
 * accept-language / headers) consumidas pelo `http-client.ts` em cenarios
 * sem navegador headless.
 */

import userAgents from './providers/user-agents.json'

const VIEWPORTS: Array<{ width: number; height: number }> = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 360, height: 800 },
]

const ACCEPT_LANGUAGES = [
  'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'pt-BR,pt;q=0.9,en;q=0.5',
  'pt-BR;q=0.9,en-US;q=0.7,en;q=0.5',
]

export interface Fingerprint {
  userAgent: string
  viewport: { width: number; height: number }
  acceptLanguage: string
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function randomUserAgent(): string {
  return pickRandom(userAgents as string[])
}

export function randomViewport(): { width: number; height: number } {
  return pickRandom(VIEWPORTS)
}

export function randomAcceptLanguage(): string {
  return pickRandom(ACCEPT_LANGUAGES)
}

/** Gera um fingerprint completo (UA + viewport + accept-language) para uma request. */
export function nextFingerprint(): Fingerprint {
  return {
    userAgent: randomUserAgent(),
    viewport: randomViewport(),
    acceptLanguage: randomAcceptLanguage(),
  }
}

/**
 * Converte um fingerprint em cabecalhos HTTP prontos para uso em `fetch`.
 * Inclui `sec-ch-ua-*` coerentes com o UA quando possivel.
 */
export function fingerprintHeaders(fp: Fingerprint): Record<string, string> {
  const isMobile = /Mobile|iPhone|Android/.test(fp.userAgent)
  const isChrome = /Chrome\//.test(fp.userAgent) && !/Edg\/|OPR\//.test(fp.userAgent)

  const headers: Record<string, string> = {
    'User-Agent': fp.userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': fp.acceptLanguage,
    'Accept-Encoding': 'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Viewport-Width': String(fp.viewport.width),
  }

  if (isChrome) {
    headers['sec-ch-ua'] = '"Chromium";v="124", "Not:A-Brand";v="8"'
    headers['sec-ch-ua-mobile'] = isMobile ? '?1' : '?0'
    headers['sec-ch-ua-platform'] = isMobile ? '"Android"' : '"Linux"'
  }

  return headers
}
