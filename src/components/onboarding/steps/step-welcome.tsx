'use client'

import { Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@/lib/constants/enums'

interface Props {
  role: UserRole
  onNext: () => void
  submitting?: boolean
}

export function StepWelcome({ role, onNext, submitting }: Props) {
  const isAdmin = role === 'ADMIN'
  return (
    <div
      data-testid="onboarding-step-welcome"
      className="space-y-4 text-center"
    >
      <div className="flex justify-center">
        <div className="rounded-full bg-primary/10 p-6">
          <Rocket className="h-12 w-12 text-primary" aria-hidden="true" />
        </div>
      </div>
      <h2 className="text-2xl font-bold">Bem-vindo ao Lead Hunting Engine!</h2>
      <p className="text-muted-foreground max-w-sm mx-auto">
        {isAdmin
          ? 'Vamos configurar sua plataforma em poucos minutos. Você definirá o perfil da empresa, nichos e regiões alvo para começar a prospectar.'
          : 'Vamos mostrar como usar a plataforma para encontrar leads de alto valor para seu negócio em apenas 3 passos.'}
      </p>
      <div className="flex justify-center pt-2">
        <Button
          onClick={onNext}
          disabled={submitting}
          data-testid="onboarding-welcome-next"
        >
          {submitting ? 'Salvando...' : 'Continuar'}
        </Button>
      </div>
    </div>
  )
}
