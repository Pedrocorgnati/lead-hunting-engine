import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { getPrisma } from '@/lib/prisma'
import { OpportunityType } from '@/lib/constants/enums'
import { AuditService } from '@/lib/services/audit-service'

const RuleSchema = z.object({
  opportunityType: z.nativeEnum(OpportunityType),
  label: z.string().min(1).max(100),
  minScore: z.number().int().min(0).max(100),
  maxScore: z.number().int().min(0).max(100),
  badgeColor: z.string().max(20).optional(),
  requiredSignals: z.array(z.string()).default([]),
  description: z.string().optional(),
})

const SaveSchema = z.object({
  rules: z.array(RuleSchema).length(5),
  reason: z.string().min(5).max(500),
})

function validateRules(rules: z.infer<typeof RuleSchema>[]) {
  const sorted = [...rules].sort((a, b) => b.minScore - a.minScore)
  const expectedOrder = [
    OpportunityType.A_NEEDS_SITE,
    OpportunityType.B_NEEDS_SYSTEM,
    OpportunityType.C_NEEDS_AUTOMATION,
    OpportunityType.D_NEEDS_ECOMMERCE,
    OpportunityType.E_SCALE,
  ]
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].opportunityType !== expectedOrder[i]) {
      return 'Ordem das faixas invalida: deve ser A > B > C > D > E por minScore'
    }
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].minScore <= sorted[i + 1].maxScore) {
      return `Overlap detectado entre ${sorted[i].opportunityType} e ${sorted[i + 1].opportunityType}`
    }
  }
  if (sorted[0].minScore <= 0) {
    return 'Faixa A deve ter minScore > 0'
  }
  if (sorted[sorted.length - 1].maxScore < 0) {
    return 'Faixa E deve ter maxScore >= 0'
  }
  return null
}

/**
 * GET /api/v1/admin/classification/rules
 * Retorna todas as regras de classificacao.
 * RBAC: ADMIN only.
 */
export async function GET() {
  try {
    await requireAdmin()
    const prisma = getPrisma()
    const rules = await prisma.classificationRule.findMany({
      orderBy: { sortOrder: 'asc' },
    })
    return successResponse({ rules })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/v1/admin/classification/rules
 * Salva novas regras de classificacao com motivo e audit log.
 * RBAC: ADMIN only.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const body = await request.json()
    const parsed = SaveSchema.parse(body)

    const validationError = validateRules(parsed.rules)
    if (validationError) {
      return Response.json(
        { error: 'Dados invalidos', message: validationError },
        { status: 400 }
      )
    }

    const prisma = getPrisma()
    await prisma.$transaction(async (tx) => {
      const existing = await tx.classificationRule.findMany()
      for (const rule of parsed.rules) {
        const existingRule = existing.find(
          (r) => r.opportunityType === rule.opportunityType
        )
        if (existingRule) {
          await tx.classificationRuleHistory.create({
            data: {
              opportunityType: rule.opportunityType,
              snapshot: existingRule as never,
              changedBy: user.id,
              changeReason: parsed.reason,
            },
          })
          await tx.classificationRule.update({
            where: { id: existingRule.id },
            data: {
              label: rule.label,
              minScore: rule.minScore,
              maxScore: rule.maxScore,
              badgeColor: rule.badgeColor ?? existingRule.badgeColor,
              requiredSignals: rule.requiredSignals,
              description: rule.description,
            },
          })
        } else {
          await tx.classificationRule.create({
            data: {
              opportunityType: rule.opportunityType,
              label: rule.label,
              minScore: rule.minScore,
              maxScore: rule.maxScore,
              badgeColor: rule.badgeColor ?? 'blue',
              requiredSignals: rule.requiredSignals,
              description: rule.description,
              sortOrder: getSortOrder(rule.opportunityType),
            },
          })
        }
      }
    })

    await AuditService.log({
      userId: user.id,
      action: 'scoring_rule.updated',
      resource: 'scoring_rule',
      metadata: {
        reason: parsed.reason,
        diff: parsed.rules.map((r) => `${r.opportunityType}: ${r.minScore}-${r.maxScore}`).join('; '),
      },
      ipAddress: getIp(request),
    })

    const rules = await prisma.classificationRule.findMany({
      orderBy: { sortOrder: 'asc' },
    })
    return successResponse({ rules, message: 'Regras salvas com sucesso.' })
  } catch (error) {
    return handleApiError(error)
  }
}

function getSortOrder(type: OpportunityType): number {
  const map: Record<OpportunityType, number> = {
    [OpportunityType.A_NEEDS_SITE]: 1,
    [OpportunityType.B_NEEDS_SYSTEM]: 2,
    [OpportunityType.C_NEEDS_AUTOMATION]: 3,
    [OpportunityType.D_NEEDS_ECOMMERCE]: 4,
    [OpportunityType.E_SCALE]: 5,
  }
  return map[type] ?? 0
}

function getIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? undefined
}
