'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Tags,
  MapPin,
  CheckCircle2,
  Rocket,
  Search,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressSteps } from './progress-steps'
import { StepWelcome } from './steps/step-welcome'
import { StepCompanyProfile } from './steps/step-company-profile'
import { StepNiches } from './steps/step-niches'
import { StepRegions } from './steps/step-regions'
import { StepDone } from './steps/step-done'
import { StepOperatorColetas } from './steps/step-operator-coletas'
import { StepOperatorLeads } from './steps/step-operator-leads'
import { OnboardingTour } from '@/components/onboarding-tour'
import { useAuth } from '@/lib/hooks'
import { useToast } from '@/lib/hooks/use-toast'
import { apiClient } from '@/lib/utils/api-client'
import { trackEvent } from '@/lib/utils/analytics'
import { Routes, API_ROUTES } from '@/lib/constants/routes'
import { UserRole } from '@/lib/constants/enums'
import {
  getTotalOnboardingSteps,
  type CompanyProfile,
  type OnboardingData,
  type OperatorTourCompleted,
} from '@/lib/schemas/onboarding'

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

type StepKey =
  | 'welcome'
  | 'company-profile'
  | 'niches'
  | 'regions'
  | 'done'
  | 'operator-coletas'
  | 'operator-leads'

interface StepDef {
  key: StepKey
  label: string
  icon: LucideIcon
}

const STEPS_ADMIN: StepDef[] = [
  { key: 'welcome', label: 'Boas-vindas', icon: Rocket },
  { key: 'company-profile', label: 'Perfil', icon: Building2 },
  { key: 'niches', label: 'Nichos', icon: Tags },
  { key: 'regions', label: 'Regiões', icon: MapPin },
  { key: 'done', label: 'Concluir', icon: CheckCircle2 },
]

const STEPS_OPERATOR: StepDef[] = [
  { key: 'welcome', label: 'Boas-vindas', icon: Rocket },
  { key: 'operator-coletas', label: 'Coletas', icon: Search },
  { key: 'operator-leads', label: 'Leads', icon: Users },
]

function getStepsForRole(role: UserRole): StepDef[] {
  return role === UserRole.OPERATOR ? STEPS_OPERATOR : STEPS_ADMIN
}

export function OnboardingWizard() {
  const router = useRouter()
  const toast = useToast()
  const { user, loading: authLoading } = useAuth()
  const role: UserRole = user?.role ?? UserRole.OPERATOR

  const steps = useMemo(() => getStepsForRole(role), [role])
  // Sentinel para garantir que o gate role-aware exposto pelo schema sempre case
  // com o array renderizado. Vira no-op em runtime mas serve como safety net em refatorações.
  if (process.env.NODE_ENV !== 'production' && steps.length !== getTotalOnboardingSteps(role)) {
    console.warn(
      '[onboarding] step count mismatch',
      { role, steps: steps.length, expected: getTotalOnboardingSteps(role) },
    )
  }

  const [current, setCurrent] = useState(0)
  const [data, setData] = useState<OnboardingData>({})
  const [niches, setNiches] = useState<NicheOption[]>([])
  const [regions, setRegions] = useState<RegionOption[]>([])
  const [bootLoading, setBootLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [showTour, setShowTour] = useState(false)

  const totalSteps = steps.length
  const isLast = current === totalSteps - 1

  // Carga inicial: progresso + catálogo. Espera o auth carregar para garantir
  // que `role` está estabilizado antes de clamp do step.
  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    async function bootstrap() {
      const [progressRes, catalogRes] = await Promise.all([
        apiClient.get<ProgressResponse>(API_ROUTES.ONBOARDING_PROGRESS),
        apiClient.get<CatalogResponse>(API_ROUTES.ONBOARDING_CATALOG),
      ])
      if (cancelled) return

      if (progressRes.data?.data) {
        const p = progressRes.data.data
        // Clamp: se o step gravado for maior que o total do role atual,
        // volta para o último válido (ex: usuário antigo com step=4 ADMIN
        // virando OPERATOR com 3 steps).
        const safeStep = Math.min(p.step ?? 0, totalSteps - 1)
        setCurrent(Math.max(0, safeStep))
        setData(p.data ?? {})
      }
      if (catalogRes.data?.data) {
        setNiches(catalogRes.data.data.niches ?? [])
        setRegions(catalogRes.data.data.regions ?? [])
      }
      setBootLoading(false)
      // M7-G03 / TASK-6: dispara início após bootstrap (sem PII)
      trackEvent('onboarding_started', { role })
    }
    bootstrap()
    return () => {
      cancelled = true
    }
  }, [authLoading, totalSteps, role])

  async function persist(nextStep: number, patch?: Partial<OnboardingData>) {
    setSaving(true)
    const res = await apiClient.patch<ProgressResponse>(API_ROUTES.ONBOARDING_PROGRESS, {
      step: nextStep,
      ...(patch ? { data: patch } : {}),
    })
    setSaving(false)
    if (res.error) {
      toast.error('Não foi possível salvar o progresso. Tente novamente.')
      return false
    }
    if (res.data?.data?.data) setData(res.data.data.data)
    setCurrent(nextStep)
    // M7-G03 / TASK-6: dispara step concluido (sem PII)
    trackEvent('onboarding_step_completed', { step: nextStep, role })
    return true
  }

  async function handleNextInfo(extra?: Partial<OnboardingData>) {
    await persist(current + 1, extra)
  }

  async function handleWelcomeNext() {
    await handleNextInfo()
  }

  async function handleOperatorColetasNext() {
    const tour: OperatorTourCompleted = {
      coletas: true,
      leads: data.operatorTourCompleted?.leads ?? false,
    }
    await handleNextInfo({ operatorTourCompleted: tour })
  }

  async function handleCompanyProfile(values: CompanyProfile) {
    await persist(current + 1, { companyProfile: values })
  }

  async function handleNiches(selected: string[]) {
    await persist(current + 1, { niches: selected })
  }

  async function handleRegions(selected: { uf: string; cities: string[] }[]) {
    await persist(current + 1, { regions: selected })
  }

  async function handleComplete() {
    setCompleting(true)
    const finalStep = totalSteps
    // Garante step máximo no backend antes de marcar concluído
    await apiClient.patch(API_ROUTES.ONBOARDING_PROGRESS, { step: finalStep })
    // Para OPERATOR, marca tour de leads como completo
    if (role === UserRole.OPERATOR) {
      const tour: OperatorTourCompleted = {
        coletas: data.operatorTourCompleted?.coletas ?? true,
        leads: true,
      }
      await apiClient.patch(API_ROUTES.ONBOARDING_PROGRESS, {
        step: finalStep,
        data: { operatorTourCompleted: tour },
      })
    }
    const res = await apiClient.post(API_ROUTES.ONBOARDING_COMPLETE, {})
    setCompleting(false)
    if (res.error) {
      toast.error('Erro ao concluir onboarding.')
      return
    }
    toast.success('Onboarding concluído! Bem-vindo.')
    // M7-G03 / TASK-6: dispara conclusao (sem PII)
    trackEvent('onboarding_completed', { totalSteps, role })
    router.push(Routes.DASHBOARD)
  }

  function handleSkipToEnd() {
    // M7-G03 / TASK-6: dispara skip antes de chamar complete (sem PII)
    trackEvent('onboarding_skipped', { atStep: current, role })
    void handleComplete()
  }

  async function handleStartFirstCollection() {
    const selectedNiches = data.niches ?? []
    const selectedRegions = data.regions ?? []
    const firstNiche = selectedNiches[0]
    const firstRegion = selectedRegions[0]
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
      },
    )

    if (jobRes.error || !jobRes.data?.data?.id) {
      setDispatching(false)
      toast.error('Não foi possível iniciar a coleta. Tente novamente pelo dashboard.')
      return
    }

    const jobId = jobRes.data.data.id

    // Marca onboarding concluído (idempotente)
    await apiClient.patch(API_ROUTES.ONBOARDING_PROGRESS, { step: totalSteps })
    await apiClient.post(API_ROUTES.ONBOARDING_COMPLETE, {})

    setDispatching(false)
    toast.success('Sua primeira coleta foi iniciada.')
    // M7-G03 / TASK-6: dispara primeira coleta (sem PII — só slug do nicho e UF)
    trackEvent('onboarding_first_collection_dispatched', {
      niche: firstNiche,
      uf: firstRegion.uf,
    })
    router.push(`${Routes.COLETAS}/${jobId}`)
  }

  function renderStep() {
    const stepDef = steps[current]
    if (!stepDef) return null
    switch (stepDef.key) {
      case 'welcome':
        return <StepWelcome role={role} onNext={handleWelcomeNext} submitting={saving} />
      case 'company-profile':
        return (
          <StepCompanyProfile
            initial={data.companyProfile}
            onSubmit={handleCompanyProfile}
            submitting={saving}
          />
        )
      case 'niches':
        return (
          <StepNiches
            options={niches}
            initial={data.niches}
            onSubmit={handleNiches}
            submitting={saving}
          />
        )
      case 'regions':
        return (
          <StepRegions
            options={regions}
            initial={data.regions}
            onSubmit={handleRegions}
            submitting={saving}
          />
        )
      case 'done':
        return (
          <StepDone
            role={role}
            data={data}
            onStartTour={() => setShowTour(true)}
            onSkipTour={handleComplete}
            onStartFirstCollection={handleStartFirstCollection}
            dispatching={dispatching}
          />
        )
      case 'operator-coletas':
        return (
          <StepOperatorColetas
            onNext={handleOperatorColetasNext}
            submitting={saving}
          />
        )
      case 'operator-leads':
        return <StepOperatorLeads />
      default:
        return null
    }
  }

  if (authLoading || bootLoading) {
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
            <ProgressSteps steps={steps} current={current} onNavigate={setCurrent} />
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
              {current + 1} de {totalSteps}
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
