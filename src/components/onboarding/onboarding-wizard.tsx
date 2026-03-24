'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Rocket, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressSteps } from './progress-steps'
import { StepWelcome } from './steps/step-welcome'
import { StepDone } from './steps/step-done'
import { useAuth } from '@/lib/hooks/use-auth'
import { useToast } from '@/lib/hooks/use-toast'
import { apiClient } from '@/lib/utils/api-client'
import { Routes, API_ROUTES } from '@/lib/constants/routes'

const STEPS = [
  { label: 'Boas-vindas', icon: Rocket },
  { label: 'Concluir', icon: CheckCircle2 },
]

export function OnboardingWizard() {
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const [current, setCurrent] = useState(0)
  const [completing, setCompleting] = useState(false)

  const steps = STEPS

  async function handleComplete() {
    setCompleting(true)
    const res = await apiClient.post(API_ROUTES.ONBOARDING_COMPLETE, {})
    setCompleting(false)
    if (res.error) {
      toast.error('Erro ao concluir onboarding.')
      return
    }
    toast.success('Onboarding concluído! Bem-vindo ao Lead Hunting Engine.')
    router.push(Routes.DASHBOARD)
  }

  async function handleSkip() {
    await apiClient.post(API_ROUTES.ONBOARDING_COMPLETE, {})
    router.push(Routes.DASHBOARD)
  }

  const renderStep = () => {
    if (current === 0) return <StepWelcome role={user?.role ?? 'OPERATOR'} />
    return <StepDone />
  }

  const isLast = current === steps.length - 1

  return (
    <div data-testid="onboarding-wizard" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <ProgressSteps steps={steps} current={current} onNavigate={setCurrent} />
          <button
            data-testid="onboarding-skip-button"
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline min-h-[44px] px-2"
          >
            Pular onboarding
          </button>
        </div>

        {/* Step content */}
        <div data-testid="onboarding-step-content" className="rounded-xl border bg-card p-8 shadow-sm min-h-[280px] flex items-center justify-center">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            data-testid="onboarding-prev-button"
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            {current + 1} de {steps.length}
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
            <Button
              onClick={() => setCurrent(c => Math.min(steps.length - 1, c + 1))}
              data-testid="onboarding-next-button"
            >
              Próximo
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
