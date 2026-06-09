'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/use-auth'
import { Routes } from '@/lib/constants/routes'
import {
  AlertCircle,
  History,
  Loader2,
  RefreshCcw,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { OpportunityType, OPPORTUNITY_TYPE_BADGE_MAP } from '@/lib/constants/enums'
import {
  ClassificationRulesEditor,
  type ClassificationRule,
} from './_components/ClassificationRulesEditor'
import { ClassificationPreviewPanel } from './_components/ClassificationPreviewPanel'
import { SaveClassificationModal } from './_components/SaveClassificationModal'

interface RulesResp {
  data?: { rules: ClassificationRule[] }
  error?: { code: string; message: string }
}

const DEFAULT_RULES: ClassificationRule[] = [
  { opportunityType: OpportunityType.A_NEEDS_SITE, label: 'Precisa de site', minScore: 80, maxScore: 100, badgeColor: 'red', requiredSignals: [] },
  { opportunityType: OpportunityType.B_NEEDS_SYSTEM, label: 'Precisa de sistema', minScore: 65, maxScore: 79, badgeColor: 'orange', requiredSignals: [] },
  { opportunityType: OpportunityType.C_NEEDS_AUTOMATION, label: 'Precisa de automação', minScore: 50, maxScore: 64, badgeColor: 'yellow', requiredSignals: [] },
  { opportunityType: OpportunityType.D_NEEDS_ECOMMERCE, label: 'Precisa de e-commerce', minScore: 35, maxScore: 49, badgeColor: 'blue', requiredSignals: [] },
  { opportunityType: OpportunityType.E_SCALE, label: 'Precisa escalar', minScore: 0, maxScore: 34, badgeColor: 'green', requiredSignals: [] },
]

export default function ClassificacaoPage() {
  const router = useRouter()
  const { isAdmin, loading: authLoading } = useAuth()
  const [rules, setRules] = useState<ClassificationRule[]>([])
  const [draft, setDraft] = useState<Record<string, Partial<ClassificationRule>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/classification/rules/active')
      const json = (await res.json().catch(() => ({}))) as RulesResp
      if (!res.ok) {
        setError(json.error?.message ?? 'Erro ao carregar regras.')
        return
      }
      const list = json.data?.rules ?? []
      if (list.length === 0) {
        setRules(DEFAULT_RULES)
      } else {
        setRules(list)
      }
    } catch {
      setError('Erro de rede.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace(Routes.DASHBOARD)
      return
    }
    void load()
  }, [load, authLoading, isAdmin, router])

  const merged = useMemo(() => {
    const map = new Map<OpportunityType, ClassificationRule>()
    for (const r of rules) {
      const d = draft[r.opportunityType] ?? {}
      map.set(r.opportunityType, { ...r, ...d } as ClassificationRule)
    }
    const order = [
      OpportunityType.A_NEEDS_SITE,
      OpportunityType.B_NEEDS_SYSTEM,
      OpportunityType.C_NEEDS_AUTOMATION,
      OpportunityType.D_NEEDS_ECOMMERCE,
      OpportunityType.E_SCALE,
    ]
    for (const t of order) {
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
    return order.map((t) => map.get(t)!)
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

  const handleChange = (type: OpportunityType, field: keyof ClassificationRule, value: string | number | string[]) => {
    setDraft((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }))
  }

  const handleSave = async (reason: string) => {
    setSaving(true)
    try {
      const payload = merged.map((r) => ({
        opportunityType: r.opportunityType,
        label: r.label,
        minScore: r.minScore,
        maxScore: r.maxScore,
        badgeColor: r.badgeColor,
        requiredSignals: r.requiredSignals,
        description: r.description,
      }))
      const res = await fetch('/api/v1/admin/classification/rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rules: payload, reason }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Erro ao salvar.')
        return
      }
      toast.success('Regras salvas com sucesso.')
      setDraft({})
      await load()
    } catch {
      toast.error('Erro de rede.')
    } finally {
      setSaving(false)
      setSaveOpen(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    try {
      const payload = DEFAULT_RULES.map((r) => ({
        opportunityType: r.opportunityType,
        label: r.label,
        minScore: r.minScore,
        maxScore: r.maxScore,
        badgeColor: r.badgeColor,
        requiredSignals: r.requiredSignals,
        description: r.description,
      }))
      const res = await fetch('/api/v1/admin/classification/rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rules: payload, reason: 'Restaurar configuracao padrao' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Erro ao restaurar.')
        return
      }
      toast.success('Configuracao padrao restaurada.')
      setDraft({})
      await load()
    } catch {
      toast.error('Erro de rede.')
    } finally {
      setSaving(false)
      setResetOpen(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Classificacao de leads</h1>
          <p className="text-sm text-muted-foreground">Configure as faixas A-E e thresholds de classificacao.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setResetOpen(true)} disabled={saving || loading}>
            <RefreshCcw className="h-4 w-4 mr-2" aria-hidden="true" />
            Restaurar padrao
          </Button>
          <Button
            onClick={() => setSaveOpen(true)}
            disabled={saving || loading || hasConflict || rules.length === 0}
            data-testid="save-classification"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />}
            <Save className="h-4 w-4 mr-2" aria-hidden="true" />
            Salvar
          </Button>
          <Button variant="ghost" onClick={() => router.push('/admin/audit-log?resource=scoring_rule')}>
            <History className="h-4 w-4 mr-2" aria-hidden="true" />
            Ver historico
          </Button>
        </div>
      </div>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
          <Button variant="ghost" size="sm" onClick={() => void load()}>Tentar novamente</Button>
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ClassificationRulesEditor rules={rules} draft={draft} onChange={handleChange} />
          </div>
          <div>
            <ClassificationPreviewPanel rules={merged} />
          </div>
        </div>
      )}

      {!loading && rules.length === 0 && !error && (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground">Nenhuma regra configurada.</p>
          <Button onClick={() => setResetOpen(true)}>
            <RefreshCcw className="h-4 w-4 mr-2" aria-hidden="true" />
            Restaurar padrao
          </Button>
        </div>
      )}

      <SaveClassificationModal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Salvar regras de classificacao"
        description="As alteracoes serao aplicadas imediatamente."
        confirmLabel="Salvar"
        loading={saving}
        onConfirm={handleSave}
      />

      <SaveClassificationModal
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Restaurar configuracao padrao"
        description="Isso sobrescrevera todas as regras com os valores padrao."
        confirmLabel="Restaurar"
        danger
        loading={saving}
        confirmationPhrase="RESTAURAR PADRAO"
        onConfirm={handleReset}
      />
    </div>
  )
}
