'use client'

import { Search, Zap, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onNext: () => void
  submitting?: boolean
}

const HIGHLIGHTS = [
  {
    icon: Search,
    title: 'Origem dos leads',
    body: 'Cada coleta cruza Google Maps, Outscraper, Apify e análise de site para descobrir leads reais.',
  },
  {
    icon: Zap,
    title: 'Disparo em poucos cliques',
    body: 'Você escolhe nicho, cidade e provedores. O motor cuida do restante em segundo plano.',
  },
  {
    icon: ListChecks,
    title: 'Acompanhamento ao vivo',
    body: 'Veja o progresso de cada job, retome em caso de falha e libere o time para focar em abordagem.',
  },
]

export function StepOperatorColetas({ onNext, submitting }: Props) {
  return (
    <div
      data-testid="onboarding-step-operator-coletas"
      className="w-full space-y-4 text-left"
    >
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-foreground">Como usar Coletas</h2>
        <p className="text-sm text-muted-foreground">
          Coletas é o motor que transforma seu plano de prospecção em leads acionáveis.
        </p>
      </div>

      <ul className="space-y-3">
        {HIGHLIGHTS.map((item) => (
          <li
            key={item.title}
            className="flex items-start gap-3 rounded-md border border-border p-3"
          >
            <span className="rounded-md bg-primary/10 p-2">
              <item.icon className="h-4 w-4 text-primary" aria-hidden="true" />
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={submitting}
          data-testid="onboarding-operator-coletas-next"
        >
          {submitting ? 'Salvando...' : 'Continuar'}
        </Button>
      </div>
    </div>
  )
}
