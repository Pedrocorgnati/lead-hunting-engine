/**
 * outreach-engine (brainstorm 06-10): CRUD minimo de campanhas + listagem
 * com funil. Criacao em DRAFT/dryRun; ativacao exige aprovacao humana
 * (rotas dedicadas em [id]/actions).
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { createCampaign, getCampaignAutoEnroll } from '@/lib/outreach/campaign-service'

const CreateSchema = z.object({
  name: z.string().min(3).max(255),
  market: z.string().min(2).max(10).optional(),
  niche: z.string().max(255).optional(),
  sequenceId: z.string().uuid().optional(),
  slaHours: z.number().int().positive().max(720).optional(),
  abConfig: z
    .object({
      variants: z.array(
        z.object({ key: z.string().min(1).max(10), subject: z.string().max(500).optional(), body: z.string().optional() }),
      ),
    })
    .optional(),
})

export async function GET() {
  try {
    const admin = await requireAdmin()
    // Multi-tenant: campanhas sao escopadas pelo userId do criador. Mesmo
    // entre ADMINs, cada um opera apenas as proprias (defense-in-depth — nao
    // assumir "so existe 1 admin").
    const rows = await prisma.outreachCampaign.findMany({
      where: { userId: admin.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    // Expoe o auto-enroll (config de envio automatico, guardada em metadata)
    // de forma tipada para a UI nao precisar destrinchar o Json.
    const campaigns = rows.map((c) => ({ ...c, autoEnroll: getCampaignAutoEnroll(c.metadata) }))
    return successResponse({ campaigns })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return handleApiError(parsed.error)
    const result = await createCampaign({ userId: admin.id, ...parsed.data })
    return successResponse(result, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
