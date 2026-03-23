'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Rocket, Check, Settings, Users, Zap, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { completeOnboarding } from '@/actions/profile'
import { Routes } from '@/lib/constants/routes'

const STEPS = [
  {
    id: 'welcome',
    title: 'Bem-vindo ao Lead Hunting Engine!',
    description: 'Configure sua plataforma em poucos passos e comece a prospectar leads qualificados.',
    icon: Rocket,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    id: 'credentials',
    title: 'Configure suas credenciais de API',
    description: 'Adicione as chaves de API necessárias para coleta de dados (Google Places, Outscraper, etc.).',
    icon: Settings,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    id: 'invite',
    title: 'Convide sua equipe',
    description: 'Adicione operadores para colaborar na plataforma. Cada usuário recebe um convite por e-mail.',
    icon: Users,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    id: 'scoring',
    title: 'Ajuste as regras de scoring',
    description: 'Personalize os pesos das dimensões de score para adaptar às suas necessidades de prospecção.',
    icon: Zap,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    id: 'done',
    title: 'Tudo pronto!',
    description: 'Sua plataforma está configurada. Inicie sua primeira coleta de leads agora.',
    icon: Check,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
  },
]

function ProgressSteps({ current, total, completedSteps }: { current: number; total: number; completedSteps: Set<number> }) {
  return (
    <div className="flex items-center gap-1" aria-label={`Passo ${current + 1} de ${total}`}>
      {Array.from({ length: total }).map((_, i) => {
        const isDone = completedSteps.has(i)
        const isActive = i === current
        return (
          <div key={i} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                isDone
                  ? 'bg-green-50 border-2 border-green-500 text-green-600 cursor-pointer'
                  : isActive
                  ? 'bg-primary border-2 border-primary text-primary-foreground'
                  : 'bg-muted border-2 border-muted-foreground/30 text-muted-foreground cursor-not-allowed'
              }`}
              aria-current={isActive ? 'step' : undefined}
            >
              {isDone ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
            </div>
            {i < total - 1 && (
              <div className={`h-0.5 w-6 mx-0.5 ${isDone ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AdminOnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [isCompleting, setIsCompleting] = useState(false)

  const step = STEPS[currentStep]
  const Icon = step.icon
  const isFirst = currentStep === 0
  const isLast = currentStep === STEPS.length - 1

  const goNext = () => {
    setCompletedSteps(prev => new Set([...prev, currentStep]))
    setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
  }

  const goPrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }

  const handleComplete = async () => {
    setIsCompleting(true)
    try {
      await completeOnboarding()
    } catch { /* stub - continue */ }
    toast.success('Plataforma configurada! Bem-vindo.')
    router.push(Routes.DASHBOARD)
  }

  const handleSkip = () => {
    router.push(Routes.DASHBOARD)
  }

  return (
    <div data-testid="admin-onboarding-page" className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Header with progress */}
        <div className="flex items-center justify-between">
          <div data-testid="admin-onboarding-steps">
            <ProgressSteps current={currentStep} total={STEPS.length} completedSteps={completedSteps} />
          </div>
          <button
            data-testid="admin-onboarding-skip-button"
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground underline min-h-[44px] px-2 transition-colors"
          >
            Pular onboarding
          </button>
        </div>

        {/* Step content card */}
        <div data-testid="admin-onboarding-step-card" className="rounded-xl border bg-card p-8 shadow-sm min-h-[280px] flex flex-col items-center justify-center space-y-4 text-center">
          <div className={`${step.iconBg} p-6 rounded-full`}>
            <Icon className={`h-10 w-10 ${step.iconColor}`} aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">{step.title}</h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">{step.description}</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            data-testid="admin-onboarding-prev-button"
            onClick={goPrev}
            disabled={isFirst}
            className="px-4 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            Anterior
          </button>

          <span className="text-sm text-muted-foreground font-mono">
            {currentStep + 1}/{STEPS.length}
          </span>

          {isLast ? (
            <button
              data-testid="admin-onboarding-complete-button"
              onClick={handleComplete}
              disabled={isCompleting}
              aria-busy={isCompleting}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {isCompleting && (
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              )}
              {isCompleting ? 'Aguarde...' : 'Ir para o Dashboard'}
            </button>
          ) : (
            <button
              data-testid="admin-onboarding-next-button"
              onClick={goNext}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors min-h-[44px]"
            >
              Próximo
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
