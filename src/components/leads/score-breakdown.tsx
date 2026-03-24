'use client'

interface ScoreDimension {
  key: string
  label: string
  score: number
  maxScore: number
}

interface Props {
  totalScore: number
  opportunities: string[]
  breakdown: Record<string, { score?: number; maxScore?: number }>
}

const DIMENSION_LABELS: Record<string, string> = {
  website_presence: 'Presença Web',
  social_presence: 'Presença Social',
  reviews_rating: 'Avaliações',
  location_access: 'Localização',
  business_maturity: 'Maturidade',
  digital_gap: 'Gap Digital',
}

const OPPORTUNITY_LABELS: Record<string, { short: string; color: string }> = {
  A_NEEDS_SITE: { short: 'A', color: 'bg-success text-success-foreground' },
  B_NEEDS_SYSTEM: { short: 'B', color: 'bg-info text-info-foreground' },
  C_NEEDS_AUTOMATION: { short: 'C', color: 'bg-warning text-warning-foreground' },
  D_NEEDS_ECOMMERCE: { short: 'D', color: 'bg-warning/80 text-warning-foreground' },
  E_SCALE: { short: 'E', color: 'bg-destructive text-destructive-foreground' },
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min(100, Math.round((score / max) * 100))
  const color = pct >= 70 ? 'bg-success' : pct >= 40 ? 'bg-warning' : 'bg-destructive'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={`Score: ${score} de ${max}`}
        />
      </div>
      <span className="text-sm font-mono w-10 text-right">{score}</span>
    </div>
  )
}

export function ScoreBreakdown({ totalScore, opportunities, breakdown }: Props) {
  const dimensions: ScoreDimension[] = Object.entries(DIMENSION_LABELS).map(([key, label]) => ({
    key,
    label,
    score: breakdown[key]?.score ?? 0,
    maxScore: breakdown[key]?.maxScore ?? 100,
  }))

  const primaryOpp = opportunities[0]
  const oppMeta = primaryOpp ? (OPPORTUNITY_LABELS[primaryOpp] ?? { short: primaryOpp.charAt(0), color: 'bg-muted' }) : null

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold">Score de Oportunidade</h3>
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold">{totalScore}</span>
          <span className="text-muted-foreground text-sm">/100</span>
          {oppMeta && (
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${oppMeta.color}`}>
              Tipo {oppMeta.short}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {dimensions.map((dim) => (
          <div key={dim.key} className="space-y-1">
            <span className="text-sm text-muted-foreground">{dim.label}</span>
            <ScoreBar score={dim.score} max={dim.maxScore} />
          </div>
        ))}
      </div>
    </div>
  )
}
