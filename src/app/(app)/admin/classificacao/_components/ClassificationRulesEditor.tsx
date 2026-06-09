'use client'

import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle } from 'lucide-react'
import { OpportunityType, OPPORTUNITY_TYPE_BADGE_MAP } from '@/lib/constants/enums'

export interface ClassificationRule {
  id?: string
  opportunityType: OpportunityType
  label: string
  minScore: number
  maxScore: number
  badgeColor?: string
  requiredSignals: string[]
  description?: string | null
}

interface Props {
  rules: ClassificationRule[]
  draft: Record<string, Partial<ClassificationRule>>
  onChange: (type: OpportunityType, field: keyof ClassificationRule, value: string | number | string[]) => void
}

const TYPE_ORDER: OpportunityType[] = [
  OpportunityType.A_NEEDS_SITE,
  OpportunityType.B_NEEDS_SYSTEM,
  OpportunityType.C_NEEDS_AUTOMATION,
  OpportunityType.D_NEEDS_ECOMMERCE,
  OpportunityType.E_SCALE,
]

export function ClassificationRulesEditor({ rules, draft, onChange }: Props) {
  const merged = useMemo(() => {
    const map = new Map<OpportunityType, ClassificationRule>()
    for (const r of rules) {
      const d = draft[r.opportunityType] ?? {}
      map.set(r.opportunityType, { ...r, ...d } as ClassificationRule)
    }
    // Ensure all 5 types exist
    for (const t of TYPE_ORDER) {
      if (!map.has(t)) {
        const def = OPPORTUNITY_TYPE_BADGE_MAP[t]
        map.set(t, {
          opportunityType: t,
          label: def.label,
          minScore: def.defaultMin,
          maxScore: def.defaultMax,
          badgeColor: def.color,
          requiredSignals: [],
        })
      }
    }
    return TYPE_ORDER.map((t) => map.get(t)!)
  }, [rules, draft])

  const conflicts = useMemo(() => {
    const errs: Record<string, string> = {}
    for (let i = 0; i < merged.length - 1; i++) {
      const curr = merged[i]
      const next = merged[i + 1]
      if (curr.minScore <= next.maxScore) {
        errs[curr.opportunityType] = `Overlap com ${next.label}`
      }
      if (curr.minScore >= curr.maxScore) {
        errs[curr.opportunityType] = 'Min deve ser menor que Max'
      }
    }
    for (const r of merged) {
      if (r.minScore < 0) errs[r.opportunityType] = 'Min deve ser >= 0'
      if (r.maxScore > 100) errs[r.opportunityType] = 'Max deve ser <= 100'
    }
    return errs
  }, [merged])

  const hasConflict = Object.keys(conflicts).length > 0

  return (
    <div className="space-y-4" role="region" aria-label="Editor de faixas de classificacao">
      {merged.map((rule) => {
        const err = conflicts[rule.opportunityType]
        const badgeColor = rule.badgeColor ?? OPPORTUNITY_TYPE_BADGE_MAP[rule.opportunityType].color
        return (
          <Card key={rule.opportunityType} className={err ? 'border-destructive' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{rule.label}</CardTitle>
                <Badge variant="outline" className={`bg-${badgeColor}-100 text-${badgeColor}-800 border-${badgeColor}-200`}>
                  {rule.opportunityType.replace(/_/g, ' ')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor={`min-${rule.opportunityType}`}>Score minimo</Label>
                  <Input
                    id={`min-${rule.opportunityType}`}
                    type="number"
                    min={0}
                    max={100}
                    value={rule.minScore}
                    onChange={(e) => onChange(rule.opportunityType, 'minScore', parseInt(e.target.value) || 0)}
                    aria-invalid={err ? 'true' : 'false'}
                    aria-describedby={err ? `err-${rule.opportunityType}` : undefined}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`max-${rule.opportunityType}`}>Score maximo</Label>
                  <Input
                    id={`max-${rule.opportunityType}`}
                    type="number"
                    min={0}
                    max={100}
                    value={rule.maxScore}
                    onChange={(e) => onChange(rule.opportunityType, 'maxScore', parseInt(e.target.value) || 0)}
                    aria-invalid={err ? 'true' : 'false'}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`signals-${rule.opportunityType}`}>Sinais obrigatorios (um por linha)</Label>
                <textarea
                  id={`signals-${rule.opportunityType}`}
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={rule.requiredSignals.join('\n')}
                  onChange={(e) => onChange(rule.opportunityType, 'requiredSignals', e.target.value.split('\n').filter((s) => s.trim()))}
                />
              </div>
              {err && (
                <div id={`err-${rule.opportunityType}`} className="flex items-center gap-1 text-sm text-destructive" role="alert">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  {err}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
      {hasConflict && (
        <p className="text-sm text-destructive font-medium" role="alert">
          Corrija os conflitos antes de salvar.
        </p>
      )}
    </div>
  )
}
