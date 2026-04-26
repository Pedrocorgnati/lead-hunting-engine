import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'

/**
 * GET /api/v1/admin/config/providers
 *
 * Lista todos os providers de coleta/enriquecimento conhecidos pelo sistema,
 * cruzando com o estado de credencial (ativo/inativo/ausente) e últimas métricas.
 * RBAC: ADMIN.
 */

interface ProviderDescriptor {
  source: string
  label: string
  tier: 'OFFICIAL_API' | 'INTERMEDIARY' | 'HEADLESS'
  category: 'BUSINESS' | 'SOCIAL' | 'LLM' | 'OTHER'
}

const PROVIDER_CATALOG: ProviderDescriptor[] = [
  { source: 'GOOGLE_PLACES',         label: 'Google Places',          tier: 'OFFICIAL_API', category: 'BUSINESS' },
  { source: 'OUTSCRAPER',            label: 'Outscraper',             tier: 'INTERMEDIARY', category: 'BUSINESS' },
  { source: 'APIFY',                 label: 'Apify',                  tier: 'INTERMEDIARY', category: 'BUSINESS' },
  { source: 'APONTADOR',             label: 'Apontador (headless)',   tier: 'HEADLESS',     category: 'BUSINESS' },
  { source: 'GUIA_MAIS',             label: 'GuiaMais (headless)',    tier: 'HEADLESS',     category: 'BUSINESS' },
  { source: 'LINKEDIN_COMPANY',      label: 'LinkedIn Companies',     tier: 'INTERMEDIARY', category: 'BUSINESS' },
  { source: 'HERE_MAPS',             label: 'HERE Maps',              tier: 'OFFICIAL_API', category: 'BUSINESS' },
  { source: 'TOMTOM',                label: 'TomTom',                 tier: 'OFFICIAL_API', category: 'BUSINESS' },
  { source: 'INSTAGRAM_GRAPH',       label: 'Instagram Graph API',    tier: 'OFFICIAL_API', category: 'SOCIAL'   },
  { source: 'INSTAGRAM_APIFY',       label: 'Instagram (Apify)',      tier: 'INTERMEDIARY', category: 'SOCIAL'   },
  { source: 'FACEBOOK_GRAPH',        label: 'Facebook Graph API',     tier: 'OFFICIAL_API', category: 'SOCIAL'   },
  { source: 'FACEBOOK_INTERMEDIARY', label: 'Facebook (Intermediary)', tier: 'INTERMEDIARY', category: 'SOCIAL'   },
  { source: 'OPENAI',                label: 'OpenAI',                 tier: 'OFFICIAL_API', category: 'LLM'      },
  { source: 'ANTHROPIC',             label: 'Anthropic',              tier: 'OFFICIAL_API', category: 'LLM'      },
]

export async function GET() {
  try {
    await requireAdmin()

    // Credentials are the source of truth for enabled state
    const credentials = await prisma.apiCredential.findMany({
      select: { provider: true, isActive: true, usageCount: true, updatedAt: true },
    })
    const credMap = new Map(credentials.map(c => [c.provider.toUpperCase(), c]))

    const providers = PROVIDER_CATALOG.map(p => {
      const cred = credMap.get(p.source)
      return {
        source: p.source,
        label: p.label,
        tier: p.tier,
        category: p.category,
        enabled: cred?.isActive ?? false,
        hasCredential: !!cred,
        usageCount: cred?.usageCount ?? 0,
        lastUsed: cred?.updatedAt ?? null,
      }
    })

    return successResponse(providers)
  } catch (error) {
    return handleApiError(error)
  }
}
