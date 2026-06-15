/**
 * GET /api/v1/admin/outreach/lead-facets
 *
 * Facetas de nicho dos leads do operador, com contagem total e ELEGIVEL por
 * nicho. Alimenta o <select> de nicho do Centro de Outreach: o operador escolhe
 * um valor REAL (sem mismatch plural/caixa do texto livre) e ja ve, na hora, se
 * aquela audiencia tem alguem enviavel.
 *
 * "Elegivel" = mesma definicao do gate de enqueue, MENOS a supressao (que e por
 * e-mail e assincrona): email != null + integrityScore >= limiar + status
 * NEW/CONTACTED. A supressao continua sendo aplicada no enqueue real; por isso
 * `eligible` aqui e um teto (pode cair um pouco no envio). Documentado de
 * proposito — honestidade > numero perfeito (ver review adversarial 06-11).
 */
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { getConfig } from '@/lib/services/system-config'

interface NicheFacet {
  niche: string | null
  total: number
  eligible: number
}

export async function GET() {
  try {
    const admin = await requireAdmin()

    const quality = await getConfig<{ minIntegrityScore?: number }>('outreach.quality_gate')
    const minIntegrity = Number(quality.minIntegrityScore ?? 60)

    // Distribuicao total por nicho.
    const totalByNiche = await prisma.lead.groupBy({
      by: ['niche'],
      where: { userId: admin.id },
      _count: { _all: true },
    })

    // Distribuicao elegivel por nicho (mesmo gate do enqueue, sem supressao).
    const eligibleByNiche = await prisma.lead.groupBy({
      by: ['niche'],
      where: {
        userId: admin.id,
        status: { in: ['NEW', 'CONTACTED'] },
        email: { not: null },
        integrityScore: { gte: minIntegrity },
      },
      _count: { _all: true },
    })

    const eligibleMap = new Map<string | null, number>(
      eligibleByNiche.map((r) => [r.niche, r._count._all]),
    )

    const facets: NicheFacet[] = totalByNiche
      .map((r) => ({
        niche: r.niche,
        total: r._count._all,
        eligible: eligibleMap.get(r.niche) ?? 0,
      }))
      .sort((a, b) => b.eligible - a.eligible || b.total - a.total)

    const summary = {
      totalLeads: facets.reduce((s, f) => s + f.total, 0),
      eligibleLeads: facets.reduce((s, f) => s + f.eligible, 0),
      withEmail: await prisma.lead.count({ where: { userId: admin.id, email: { not: null } } }),
      minIntegrity,
    }

    return successResponse({ facets, summary })
  } catch (error) {
    return handleApiError(error)
  }
}
