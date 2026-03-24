export interface SiteAnalysisResult {
  url: string
  reachable: boolean
  httpStatus: number | null
  hasSsl: boolean
  finalUrl: string | null
  title: string | null
  description: string | null
  mobileFriendly: boolean | null
  loadTimeMs: number | null
  analyzedAt: Date
}

/**
 * Analisa um site: HTTP status, SSL, title, meta-description e mobile-friendliness.
 * Nunca lança exceção — retorna objeto com reachable: false em caso de erro.
 * Guardrail SSRF: bloqueia localhost e IPs privados antes de fazer fetch.
 * Guardrail SYS_003: AbortController de 5s → httpStatus: 408.
 */
export async function analyzeSite(url: string): Promise<SiteAnalysisResult> {
  const base: SiteAnalysisResult = {
    url,
    reachable: false,
    httpStatus: null,
    hasSsl: url.startsWith('https://'),
    finalUrl: null,
    title: null,
    description: null,
    mobileFriendly: null,
    loadTimeMs: null,
    analyzedAt: new Date(),
  }

  if (!url || url.length < 4) return base

  // Prevenção SSRF — bloquear antes do fetch
  if (isPrivateUrl(url)) {
    return { ...base, httpStatus: 403 }
  }

  try {
    const start = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)

    let res: Response
    try {
      res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Lead-Hunting-Engine/1.0 (+https://leadhunting.com.br)',
        },
      })
    } finally {
      clearTimeout(timer)
    }

    const loadTimeMs = Date.now() - start
    const hasSsl = res.url.startsWith('https://')

    // Ler apenas os primeiros 8kb de HTML para extrair metadata
    const text = await readPartial(res, 8192)

    return {
      ...base,
      reachable: res.ok,
      httpStatus: res.status,
      hasSsl,
      finalUrl: res.url,
      title: extractTitle(text),
      description: extractMetaDescription(text),
      mobileFriendly: detectMobileFriendly(text),
      loadTimeMs,
    }
  } catch (e) {
    const isTimeout = e instanceof Error && (e.message.includes('abort') || e.name === 'AbortError')
    return {
      ...base,
      reachable: false,
      httpStatus: isTimeout ? 408 : null,
    }
  }
}

function isPrivateUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)
  } catch {
    return true // URL inválida → bloquear
  }
}

async function readPartial(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''

  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      totalBytes += value.length
      if (totalBytes >= maxBytes) {
        reader.cancel()
        break
      }
    }
  } catch {
    // Ignorar erros de leitura parcial
  }

  const combined = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }

  return new TextDecoder().decode(combined)
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1]?.trim() ?? null
}

function extractMetaDescription(html: string): string | null {
  const match =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
  return match?.[1]?.trim() ?? null
}

function detectMobileFriendly(html: string): boolean | null {
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html)
  return hasViewport
}
