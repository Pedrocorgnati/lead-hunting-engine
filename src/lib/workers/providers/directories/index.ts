import type { BusinessSearchParams, BusinessResult } from '../types'
import { YelpApiProvider } from './yelp'

/**
 * Registro central dos providers de diretorio (API-first).
 *
 * Providers aqui listados assumem API oficial disponivel (token via
 * `getApiKey`). Para diretorios brasileiros sem API publica (Apontador,
 * GuiaMais) veja `strategies/*-headless.ts` e os dispatchers
 * `searchBusinessesApontador` / `searchBusinessesGuiaMais` em
 * provider-manager.ts — sao tier HEADLESS gated por feature flag.
 *
 * LinkedIn empresas e tratado separadamente em `linkedin-companies.ts`
 * como tier INTERMEDIARY via Apify oficial (compliance: nunca scraping
 * direto ao dominio linkedin.com).
 */

export interface DirectoryProviderDescriptor {
  id: 'yelp-api' | 'apontador-headless' | 'guiamais-headless' | 'linkedin-companies'
  tier: 'OFFICIAL_API' | 'INTERMEDIARY' | 'HEADLESS'
  /** Env var ou credencial que habilita o provider (se ausente, skip silencioso) */
  credentialKey: string | null
  description: string
}

export const DIRECTORY_PROVIDERS: DirectoryProviderDescriptor[] = [
  {
    id: 'yelp-api',
    tier: 'OFFICIAL_API',
    credentialKey: 'yelp-api',
    description: 'Yelp Fusion API — cobertura EUA/global, sem fallback scraping (TOS).',
  },
  {
    id: 'apontador-headless',
    tier: 'HEADLESS',
    credentialKey: null,
    description: 'Apontador — scraping com rate limit, gated por HEADLESS_ENABLED.',
  },
  {
    id: 'guiamais-headless',
    tier: 'HEADLESS',
    credentialKey: null,
    description: 'GuiaMais — scraping com rate limit, gated por HEADLESS_ENABLED.',
  },
  {
    id: 'linkedin-companies',
    tier: 'INTERMEDIARY',
    credentialKey: 'linkedin-companies',
    description: 'LinkedIn empresas via Apify oficial — jamais scraping direto.',
  },
]

export { YelpApiProvider }

export type YelpDispatchResult = {
  results: BusinessResult[]
  tier: 'OFFICIAL_API' | 'HEADLESS'
  source: 'yelp-api' | 'yelp-headless' | 'none'
}

/**
 * Helper exportado para o provider-manager decidir entre Yelp API e Yelp
 * headless. Mantem o contrato antigo (HEADLESS-first) mas permite preferir
 * API quando o token existir.
 */
export async function tryYelpApi(
  params: BusinessSearchParams,
  apiKey: string | null,
): Promise<YelpDispatchResult> {
  if (!apiKey) return { results: [], tier: 'OFFICIAL_API', source: 'none' }
  try {
    const results = await YelpApiProvider.search(params, apiKey)
    return { results, tier: 'OFFICIAL_API', source: 'yelp-api' }
  } catch {
    // Falha da API devolve vazio — dispatcher pode tentar fallback headless
    return { results: [], tier: 'OFFICIAL_API', source: 'none' }
  }
}
