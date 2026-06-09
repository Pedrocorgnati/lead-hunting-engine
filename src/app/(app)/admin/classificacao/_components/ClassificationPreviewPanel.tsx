'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { OpportunityType, OPPORTUNITY_TYPE_BADGE_MAP } from '@/lib/constants/enums'
import type { ClassificationRule } from './ClassificationRulesEditor'

interface Props {
  rules: ClassificationRule[]
}

const SAMPLE_LEAD = {
  businessMaturity: 72,
  digitalGap: 68,
  facebookAbandoned: false,
  siteReachable: true,
}

export function ClassificationPreviewPanel({ rules }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    opportunityType: OpportunityType
    score: number
    matchedRule: ClassificationRule | null
  } | null>(null)

  async function handleSimulate() {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/admin/classification/rules/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rules, lead: SAMPLE_LEAD }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Erro na simulacao.')
        return
      }
      setResult(json.data)
      toast.success('Simulacao concluida.')
    } catch {
      toast.error('Erro de rede.')
    } finally {
      setLoading(false)
    }
  }

  const badgeInfo = result ? OPPORTUNITY_TYPE_BADGE_MAP[result.opportunityType] : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preview</CardTitle>
        <CardDescription>Simule a classificacao com um lead de exemplo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
          <p><span className="font-medium">Lead:</span> Restaurante Sabor Caseiro</p>
          <p><span className="font-medium">Maturidade:</span> {SAMPLE_LEAD.businessMaturity}</p>
          <p><span className="font-medium">Gap Digital:</span> {SAMPLE_LEAD.digitalGap}</p>
          <p><span className="font-medium">Site:</span> {SAMPLE_LEAD.siteReachable ? 'Sim' : 'Nao'}</p>
        </div>
        <Button onClick={() => void handleSimulate()} disabled={loading || rules.length === 0} className="w-full" aria-label="Simular classificacao">
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />}
          <Play className="h-4 w-4 mr-2" aria-hidden="true" />
          Simular
        </Button>
        {result && badgeInfo && (
          <div className="rounded-lg border p-3 space-y-2" role="status">
            <div className="flex items-center gap-2">
              <span className="font-medium">Resultado:</span>
              <Badge variant="outline" className={`bg-${badgeInfo.color}-100 text-${badgeInfo.color}-800 border-${badgeInfo.color}-200`}>
                {badgeInfo.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Score calculado: <span className="font-medium">{result.score}</span></p>
            {result.matchedRule && (
              <p className="text-sm text-muted-foreground">
                Faixa: {result.matchedRule.minScore} - {result.matchedRule.maxScore}
              </p>
            )}
          </div>
        )}
        {!result && !loading && (
          <p className="text-sm text-muted-foreground text-center" role="status">
            Clique em Simular para ver o resultado.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
