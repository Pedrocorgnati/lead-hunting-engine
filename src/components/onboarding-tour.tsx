'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Routes } from '@/lib/constants/routes'

/**
 * OnboardingTour — tour guiado mínimo sem dependências externas.
 * Em vez de overlays atrelados a elementos do DOM em outras rotas, apresenta
 * uma sequência de cards explicativos com CTA direto para as telas principais.
 * Alinhado ao CL-130 (tutorial interativo com 3 telas-chave).
 */

const STEPS = [
  {
    title: 'Radar de oportunidades',
    body: 'Acompanhe em tempo real os leads quentes identificados pela engine de scoring.',
    href: Routes.RADAR,
    cta: 'Abrir Radar',
  },
  {
    title: 'Gestão de leads',
    body: 'Todos os leads capturados aparecem em Leads. Aplique filtros, veja detalhes e exporte.',
    href: Routes.LEADS,
    cta: 'Ver Leads',
  },
  {
    title: 'Coletas e automações',
    body: 'Configure coletas automáticas em Coletas. Cada job gera novos leads conforme seu nicho e região.',
    href: Routes.COLETAS,
    cta: 'Ir para Coletas',
  },
]

interface Props {
  onClose: () => void
}

export function OnboardingTour({ onClose }: Props) {
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const isLast = index === STEPS.length - 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-tour-title"
      data-testid="onboarding-tour"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tutorial {index + 1} de {STEPS.length}
          </span>
          <button
            type="button"
            data-testid="onboarding-tour-skip"
            onClick={onClose}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Pular tour
          </button>
        </div>

        <h3
          id="onboarding-tour-title"
          className="text-lg font-semibold text-foreground"
          data-testid="onboarding-tour-title"
        >
          {step.title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            data-testid="onboarding-tour-prev"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            Anterior
          </Button>
          <div className="flex items-center gap-2">
            <Link
              href={step.href}
              data-testid="onboarding-tour-cta"
              className="text-sm text-primary hover:underline"
              onClick={onClose}
            >
              {step.cta}
            </Link>
            {isLast ? (
              <Button data-testid="onboarding-tour-finish" onClick={onClose}>
                Concluir
              </Button>
            ) : (
              <Button
                data-testid="onboarding-tour-next"
                onClick={() => setIndex((i) => Math.min(STEPS.length - 1, i + 1))}
              >
                Próximo
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
