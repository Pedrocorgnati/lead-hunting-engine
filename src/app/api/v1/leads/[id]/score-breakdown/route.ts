import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth'

export interface ScoreRule {
  id: string
  name: string
  weight: number
  contribution: number
  matched: boolean
  reason: string
}

export interface ScoreBreakdownResponse {
  totalScore: number
  rules: ScoreRule[]
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireSession(req)
  if (!session) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: { score: true, scoreBreakdown: true },
  })
  if (!lead) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })

  const breakdown = (lead.scoreBreakdown as Record<string, { score?: number; maxScore?: number }>) ?? {}

  const RULE_LABELS: Record<string, string> = {
    website_presence: 'Presença Web',
    social_presence: 'Presença Social',
    reviews_rating: 'Avaliações',
    location_access: 'Localização',
    business_maturity: 'Maturidade',
    digital_gap: 'Gap Digital',
  }

  const rules: ScoreRule[] = Object.entries(breakdown).map(([key, val]) => {
    const score = val?.score ?? 0
    const max = val?.maxScore ?? 10
    return {
      id: key,
      name: RULE_LABELS[key] ?? key,
      weight: max,
      contribution: score,
      matched: score > 0,
      reason: score > 0
        ? `Critério "${RULE_LABELS[key] ?? key}" atendido (${score}/${max})`
        : `Critério "${RULE_LABELS[key] ?? key}" não atendido`,
    }
  }).sort((a, b) => b.contribution - a.contribution)

  return NextResponse.json({
    totalScore: lead.score ?? 0,
    rules,
  } satisfies ScoreBreakdownResponse)
}
