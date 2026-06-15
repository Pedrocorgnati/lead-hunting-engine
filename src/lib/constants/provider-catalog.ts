/**
 * Catalogo canonico de providers de coleta/enriquecimento.
 *
 * Fonte unica da verdade da listagem de providers conhecidos pelo sistema.
 * Consumido por:
 *  - GET /api/v1/admin/config/providers (listagem basica + estado de credencial)
 *  - GET /api/v1/admin/providers/status (health operacional por provider)
 *
 * Manter sincronizado com FALLBACK_CHAIN em
 * src/app/api/v1/admin/providers/[provider]/_provider-operations.ts.
 */

export interface ProviderDescriptor {
  source: string
  label: string
  tier: 'OFFICIAL_API' | 'INTERMEDIARY' | 'HEADLESS'
  category: 'BUSINESS' | 'SOCIAL' | 'LLM' | 'OTHER'
}

export const PROVIDER_CATALOG: ProviderDescriptor[] = [
  { source: 'GOOGLE_PLACES',         label: 'Google Places',           tier: 'OFFICIAL_API', category: 'BUSINESS' },
  { source: 'OUTSCRAPER',            label: 'Outscraper',              tier: 'INTERMEDIARY', category: 'BUSINESS' },
  { source: 'APIFY',                 label: 'Apify',                   tier: 'INTERMEDIARY', category: 'BUSINESS' },
  { source: 'APONTADOR',             label: 'Apontador (headless)',    tier: 'HEADLESS',     category: 'BUSINESS' },
  { source: 'GUIA_MAIS',             label: 'GuiaMais (headless)',     tier: 'HEADLESS',     category: 'BUSINESS' },
  { source: 'LINKEDIN_COMPANY',      label: 'LinkedIn Companies',      tier: 'INTERMEDIARY', category: 'BUSINESS' },
  // H-06: HERE/TomTom sao GEOCODERS (endereco->coords, vivem em workers/geo/),
  // nunca entram no PROVIDER_ORDER de searchBusinesses. category OTHER para a UI
  // nao os mostrar como fontes de busca de negocio.
  { source: 'HERE_MAPS',             label: 'HERE Maps (geocoder)',    tier: 'OFFICIAL_API', category: 'OTHER'    },
  { source: 'TOMTOM',                label: 'TomTom (geocoder)',       tier: 'OFFICIAL_API', category: 'OTHER'    },
  { source: 'INSTAGRAM_GRAPH',       label: 'Instagram Graph API',     tier: 'OFFICIAL_API', category: 'SOCIAL'   },
  { source: 'INSTAGRAM_APIFY',       label: 'Instagram (Apify)',       tier: 'INTERMEDIARY', category: 'SOCIAL'   },
  { source: 'FACEBOOK_GRAPH',        label: 'Facebook Graph API',      tier: 'OFFICIAL_API', category: 'SOCIAL'   },
  { source: 'FACEBOOK_INTERMEDIARY', label: 'Facebook (Intermediary)', tier: 'INTERMEDIARY', category: 'SOCIAL'   },
  // H-10: LLMs (geracao de pitch), nao fontes de coleta.
  { source: 'KIMI',                  label: 'Kimi (pitch)',            tier: 'OFFICIAL_API', category: 'LLM'      },
  { source: 'OPENAI',                label: 'OpenAI (pitch)',          tier: 'OFFICIAL_API', category: 'LLM'      },
  { source: 'ANTHROPIC',             label: 'Anthropic (pitch)',       tier: 'OFFICIAL_API', category: 'LLM'      },
]
