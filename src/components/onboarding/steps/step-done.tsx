'use client'

import { PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OnboardingData } from '@/lib/schemas/onboarding'

interface Props {
  data?: OnboardingData
  onStartTour: () => void
  onSkipTour: () => void
  onStartFirstCollection?: () => void
  dispatching?: boolean
}

export function StepDone({
  data,
  onStartTour,
  onSkipTour,
  onStartFirstCollection,
  dispatching = false,
}: Props) {
  const niches = data?.niches ?? []
  const regions = data?.regions ?? []
  const integrations = data?.integrations?.integrations?.filter((i) => i.configured) ?? []
  const firstRegion = regions[0]
  const firstCity = firstRegion?.cities?.[0]
  const canDispatch =
    !!onStartFirstCollection && niches.length > 0 && !!firstRegion && !!firstCity

  return (
    <div className="w-full space-y-4 text-center" data-testid="onboarding-step-done">
      <div className="flex justify-center">
        <div className="rounded-full bg-success/10 p-6">
          <PartyPopper className="h-12 w-12 text-success" aria-hidden="true" />
        </div>
      </div>
      <h2 className="text-2xl font-bold">Tudo pronto!</h2>
      <p className="text-muted-foreground max-w-sm mx-auto">
        {data?.companyProfile?.companyName
          ? `Bem-vindo, ${data.companyProfile.companyName}.`
          : 'Sua plataforma está configurada.'}{' '}
        Veja o resumo abaixo e inicie o tour guiado.
      </p>

      <dl
        className="mx-auto w-full max-w-sm space-y-1 rounded-md border border-border p-3 text-left text-sm"
        data-testid="onboarding-done-summary"
      >
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Nichos</dt>
          <dd className="font-medium">{niches.length}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Regiões</dt>
          <dd className="font-medium">{regions.length}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Integrações marcadas</dt>
          <dd className="font-medium">{integrations.length}</dd>
        </div>
      </dl>

      <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
        <Button
          variant="outline"
          onClick={onSkipTour}
          data-testid="onboarding-done-skip-tour"
        >
          Pular tour
        </Button>
        <Button onClick={onStartTour} data-testid="onboarding-done-start-tour">
          Iniciar tour guiado
        </Button>
      </div>

      {canDispatch && (
        <div className="pt-2">
          <Button
            onClick={onStartFirstCollection}
            disabled={dispatching}
            data-testid="onboarding-done-first-collection"
            className="w-full sm:w-auto"
          >
            {dispatching
              ? 'Iniciando...'
              : `Iniciar primeira coleta (${niches[0]} em ${firstCity})`}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Vamos rodar sua primeira coleta com o primeiro nicho e cidade selecionados.
          </p>
        </div>
      )}
    </div>
  )
}
