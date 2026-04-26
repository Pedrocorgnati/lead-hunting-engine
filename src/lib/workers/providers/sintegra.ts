import { kvGet, kvSet } from '@/lib/cache/kv-cache'

/**
 * Sintegra Provider — validacao de Inscricao Estadual (IE) por UF.
 *
 * STUB: cada UF tem site proprio de consulta (uf.sintegra.gov.br) com
 * captcha e formulario dinamico. Requer Playwright + solver de captcha
 * por UF. Enquanto infra nao esta provisionada, retorna null.
 *
 * Ver PENDING-ACTIONS.md secao "TASK-11 providers secundarios".
 */

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

export interface SintegraData {
  uf: string
  ie: string | null
  cnpj: string | null
  razaoSocial: string | null
  situacao: 'ATIVA' | 'INATIVA' | 'SUSPENSA' | 'DESCONHECIDA'
  endereco: string | null
  consultadoEm: string // ISO date
}

export async function querySintegra(uf: string, ieOrCnpj: string): Promise<SintegraData | null> {
  const ufNorm = uf.trim().toUpperCase()
  const docNorm = ieOrCnpj.replace(/\D/g, '')
  if (!ufNorm || !docNorm) return null

  const cacheKey = `sintegra:${ufNorm}:${docNorm}`
  const cached = await kvGet<SintegraData>(cacheKey)
  if (cached) return cached

  const enabled = process.env.SINTEGRA_ENABLED === 'true'
  if (!enabled) {
    console.warn('[sintegra] skipped: provider desabilitado (SINTEGRA_ENABLED != true); consulta requer Playwright + captcha solver por UF')
    return null
  }

  try {
    // Ponto de extensao: integrar scraping headless por UF.
    // Endpoint base varia: https://www.sintegra.{uf}.gov.br/ (padronizacao manual por UF).
    console.warn(`[sintegra] scraping nao implementado para UF=${ufNorm} doc=${docNorm}`)
    return null
  } catch (e) {
    console.warn('[sintegra] erro:', (e as Error).message)
    return null
  } finally {
    void cacheKey
    void CACHE_TTL_MS
    void kvSet
  }
}
