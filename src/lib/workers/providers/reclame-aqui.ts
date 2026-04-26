import { kvGet, kvSet } from '@/lib/cache/kv-cache'

/**
 * Reclame Aqui Provider — reputacao e numero de reclamacoes.
 *
 * STUB: scraping requer Playwright + resolucao de anti-bot do Reclame Aqui
 * (Cloudflare + JS challenge). Enquanto a infra headless dedicada nao
 * estiver provisionada com credenciais, funcao retorna null e loga warn.
 *
 * Ver PENDING-ACTIONS.md secao "TASK-11 providers secundarios".
 */

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

export interface ReclameAquiData {
  companyName: string
  reputation: number | null // 0-10
  totalComplaints: number | null
  resolutionRate: number | null // 0-100 (%)
  sourceUrl: string | null
}

export async function queryReclameAqui(query: string): Promise<ReclameAquiData | null> {
  const q = query.trim()
  if (!q) return null

  const cacheKey = `reclame-aqui:${q.toLowerCase()}`
  const cached = await kvGet<ReclameAquiData>(cacheKey)
  if (cached) return cached

  const enabled = process.env.RECLAME_AQUI_ENABLED === 'true'
  if (!enabled) {
    console.warn('[reclame-aqui] skipped: provider desabilitado (RECLAME_AQUI_ENABLED != true); scraping requer Playwright + anti-bot')
    return null
  }

  // Ponto de extensao: integrar aqui scraping via Playwright quando disponivel.
  // Padrao: buscar em https://www.reclameaqui.com.br/empresa/{slug}/ e extrair
  // reputacao ("Nota do Consumidor") e total de reclamacoes.
  try {
    // Implementacao real dependera de src/lib/workers/providers/headless-scraper
    // + resolucao de captcha/cloudflare. Deixamos stub para nao bloquear pipeline.
    console.warn(`[reclame-aqui] scraping nao implementado para "${q}"`)
    return null
  } catch (e) {
    console.warn('[reclame-aqui] erro:', (e as Error).message)
    return null
  } finally {
    // Nao cacheia null explicitamente para permitir reintento apos configuracao.
    void cacheKey
    void CACHE_TTL_MS
    void kvSet
  }
}
