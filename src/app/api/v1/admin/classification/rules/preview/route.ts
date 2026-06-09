import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { classifyOpportunityWithConfig } from '@/lib/intelligence/classifier/opportunity-classifier'
import { OpportunityType } from '@/lib/constants/enums'

const PreviewSchema = z.object({
  rules: z.array(
    z.object({
      opportunityType: z.nativeEnum(OpportunityType),
      minScore: z.number().int().min(0).max(100),
      maxScore: z.number().int().min(0).max(100),
      requiredSignals: z.array(z.string()).optional(),
    })
  ).length(5),
  lead: z.object({
    businessMaturity: z.number().min(0).max(100),
    digitalGap: z.number().min(0).max(100),
    facebookAbandoned: z.boolean().optional(),
    siteReachable: z.boolean().nullable().optional(),
  }),
})

/**
 * POST /api/v1/admin/classification/rules/preview
 * Simula classificacao com regras em draft.
 * RBAC: ADMIN only.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = await request.json()
    const parsed = PreviewSchema.parse(body)

    const scoreResult = {
      businessMaturity: parsed.lead.businessMaturity,
      digitalGap: parsed.lead.digitalGap,
    }

    const enriched = {
      scores: {
        businessMaturity: parsed.lead.businessMaturity,
        digitalGap: parsed.lead.digitalGap,
      },
    } as never

    const socialSignals = {
      facebookAbandoned: parsed.lead.facebookAbandoned,
      siteReachable: parsed.lead.siteReachable,
    }

    const result = classifyOpportunityWithConfig(
      scoreResult as never,
      enriched,
      socialSignals,
      parsed.rules
    )

    const matchedRule = parsed.rules.find((r) => r.opportunityType === result)

    return successResponse({
      opportunityType: result,
      score: Math.round(
        parsed.lead.businessMaturity * 0.5 + parsed.lead.digitalGap * 0.5
      ),
      matchedRule: matchedRule ?? null,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
