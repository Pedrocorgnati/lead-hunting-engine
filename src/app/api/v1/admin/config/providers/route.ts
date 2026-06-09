import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { PROVIDER_CATALOG } from '@/lib/constants/provider-catalog'

/**
 * GET /api/v1/admin/config/providers
 *
 * Lista todos os providers de coleta/enriquecimento conhecidos pelo sistema,
 * cruzando com o estado de credencial (ativo/inativo/ausente) e últimas métricas.
 * RBAC: ADMIN.
 *
 * PROVIDER_CATALOG e fonte unica da verdade compartilhada com
 * GET /api/v1/admin/providers/status (ver src/lib/constants/provider-catalog.ts).
 */

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
