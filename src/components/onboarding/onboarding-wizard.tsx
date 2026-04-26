'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Tags, MapPin, Plug, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressSteps } from './progress-steps'
import { StepCompanyProfile } from './steps/step-company-profile'
import { StepNiches } from './steps/step-niches'
import { StepRegions } from './steps/step-regions'
import { StepIntegrations } from './steps/step-integrations'
import { StepDone } from './steps/step-done'
import { OnboardingTour } from '@/components/onboarding-tour'
import { useToast } from '@/lib/hooks/use-toast'
import { apiClient } from '@/lib/utils/api-client'
import { Routes, API_ROUTES } from '@/lib/constants/routes'
import type { CompanyProfile, OnboardingData } from '@/lib/schemas/onboarding'
import { TOTAL_ONBOARDING_STEPS } from '@/lib/schemas/onboarding'

const STEPS = [
  { label: 'Perfil', icon: Building2 },
  { label: 'Nichos', icon: Tags },
  { label: 'Regiões', icon: MapPin },
  { label: 'Integrações', icon: Plug },
  { label: 'Concluir', icon: CheckCircle2 },
]

interface NicheOption {
  id: string
  slug: string
  label: string
}

interface RegionOption {
  id: string
  uf: string
  name: string
  capital: string
  cities: string[]
}

interface ProgressResponse {
  data: {
    step: number
    data: OnboardingData
    completed: boolean
    totalSteps: number
  }
}

interface CatalogResponse {
  data: {
    regions: RegionOption[]
    niches: NicheOption[]
  }
}

export function OnboardingWizard() {
  const router = useRouter()
  const toast = useToast()
  const [current, setCurrent] = useState(0)
  const [data, setData] = useState<OnboardingData>({})
  const [niches, setNiches] = useState<NicheOption[]>([])
  const [regions, setRegions] = useState<RegionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [showTour, setShowTour] = useState(false)

  // Carga inicial: progresso + catálogo
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      const [progressRes, catalogRes] = await Promise.all([
        apiClient.get<ProgressResponse>(API_ROUTES.ONBOARDING_PROGRESS),
        apiClient.get<CatalogResponse>(API_ROUTES.ONBOARDING_CATALOG),
      ])
      if (cancelled) return

      if (progressRes.data?.data) {
        const p = progressRes.data.data
        setCurrent(Math.min(p.step ?? 0, STEPS.length - 1))
        setData(p.data ?? {})
      }
      if (catalogRes.data?.data) {
        setNiches(catalogRes.data.data.niches ?? [])
        setRegions(catalogRes.data.data.regions ?? [])
      }
      setLoading(false)
    }
    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  async function persist(nextStep: number, patch: Partial<OnboardingData>) {
    setSaving(true)
    const res = await apiClient.patch<ProgressResponse>(API_ROUTES.ONBOARDING_PROGRESS, {
      step: nextStep,
      data: patch,
    })
    setSaving(false)
    if (res.error) {
      toast.error('Não foi possível salvar o progresso. Tente novamente.')
      return false
    }
    if (res.data?.data?.data) setData(res.data.data.data)
    setCurrent(nextStep)
    return true
  }

  async function handleCompanyProfile(values: CompanyProfile) {
    await persist(1, { companyProfile: values })
  }

  async function handleNiches(selected: string[]) {
    await persist(2, { niches: selected })
  }

  async function handleRegions(selected: { uf: string; cities: string[] }[]) {
    await persist(3, { regions: selected })
  }

  async function handleIntegrations(payload: {
    integrations: { provider: string; configured: boolean }[]
    skipped: boolean
  }) {
    await persist(4, { integrations: payload })
  }

  async function handleComplete() {
    setCompleting(true)
    // Garante step=5 no backend antes de marcar concluído
    await apiClient.patch(API_ROUTES.ONBOARDING_PROGRESS, {
      step: TOTAL_ONBOARDING_STEPS,
    })
    const res = await apiClient.post(API_ROUTES.ONBOARDING_COMPLETE, {})
    setCompleting(false)
    if (res.error) {
      toast.error('Erro ao concluir onboarding.')
      return
    }
    toast.success('Onboarding concluído! Bem-vindo.')
    router.push(Routes.DASHBOARD)
  }

  function handleSkipToEnd() {
    // Marca como concluído sem dados extras
    void handleComplete()
  }

  async function handleStartFirstCollection() {
    const niches = data.niches ?? []
    const regions = data.regions ?? []
    const firstNiche = niches[0]
    const firstRegion = regions[0]
    const firstCity = firstRegion?.cities?.[0]
    if (!firstNiche || !firstRegion || !firstCity) {
      toast.error('Configure pelo menos um nicho e uma cidade antes de iniciar a coleta.')
      return
    }

    setDispatching(true)
    const jobRes = await apiClient.post<{ data: { id: string; status: string } }>(
      API_ROUTES.JOBS,
      {
        city: firstCity,
        state: firstRegion.uf,
        niche: firstNiche,
        sources: ['GOOGLE_MAPS'],
      }
    )

    if (jobRes.error || !jobRes.data?.data?.id) {
      setDispatching(false)
      toast.error('Nao foi possivel iniciar a coleta. Tente novamente pelo dashboard.')
      return
    }

    const jobId = jobRes.data.data.id

    // Marca onboarding concluido (idempotente)
    await apiClient.patch(API_ROUTES.ONBOARDING_PROGRESS, { step: TOTAL_ONBOARDING_STEPS })
    await apiClient.post(API_ROUTES.ONBOARDING_COMPLETE, {})

    setDispatching(false)
    toast.success('Sua primeira coleta foi iniciada.')
    router.push(`${Routes.COLETAS}/${jobId}`)
  }

  function renderStep() {
    if (current === 0) {
      return (
        <StepCompanyProfile
          initial={data.companyProfile}
          onSubmit={handleCompanyProfile}
          submitting={saving}
        />
      )
    }
    if (current === 1) {
      return (
        <StepNiches
          options={niches}
          initial={data.niches}
          onSubmit={handleNiches}
          submitting={saving}
        />
      )
    }
    if (current === 2) {
      return (
        <StepRegions
          options={regions}
          initial={data.regions}
          onSubmit={handleRegions}
          submitting={saving}
        />
      )
    }
    if (current === 3) {
      return (
        <StepIntegrations
          initial={data.integrations}
          onSubmit={handleIntegrations}
          submitting={saving}
        />
      )
    }
    return (
      <StepDone
        data={data}
        onStartTour={() => setShowTour(true)}
        onSkipTour={handleComplete}
        onStartFirstCollection={handleStartFirstCollection}
        dispatching={dispatching}
      />
    )
  }

  const isLast = current === STEPS.length - 1

  if (loading) {
    return (
      <div
        data-testid="onboarding-wizard-loading"
        className="flex min-h-screen items-center justify-center px-4"
      >
        <p className="text-sm text-muted-foreground">Carregando seu progresso...</p>
      </div>
    )
  }

  return (
    <>
      <div
        data-testid="onboarding-wizard"
        className="flex min-h-screen items-center justify-center px-4 py-8"
      >
        <div className="w-full max-w-2xl space-y-6">
          <div className="flex items-center justify-between gap-4">
            <ProgressSteps steps={STEPS} current={current} onNavigate={setCurrent} />
            <button
              data-testid="onboarding-skip-button"
              onClick={handleSkipToEnd}
              disabled={completing}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline min-h-[44px] px-2"
            >
              Pular tudo
            </button>
          </div>

          <div
            data-testid="onboarding-step-content"
            className="rounded-xl border bg-card p-6 shadow-sm"
          >
            {renderStep()}
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0 || saving || completing}
              data-testid="onboarding-prev-button"
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              {current + 1} de {STEPS.length}
            </span>
            {isLast ? (
              <Button
                onClick={handleComplete}
                disabled={completing}
                data-testid="onboarding-complete-button"
              >
                {completing ? 'Aguarde...' : 'Ir para o Dashboard'}
              </Button>
            ) : (
              <span aria-hidden="true" className="w-[88px]" />
            )}
          </div>
        </div>
      </div>

      {showTour && (
        <OnboardingTour
          onClose={() => {
            setShowTour(false)
            void handleComplete()
          }}
        />
      )}
    </>
  )
}
