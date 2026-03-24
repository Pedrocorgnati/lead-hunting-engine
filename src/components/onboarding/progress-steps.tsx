'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Step {
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface Props {
  steps: Step[]
  current: number
  onNavigate: (index: number) => void
}

export function ProgressSteps({ steps, current, onNavigate }: Props) {
  return (
    <nav aria-label="Progresso do onboarding" className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const isDone = idx < current
        const isActive = idx === current

        return (
          <div key={idx} className="flex items-center">
            <button
              onClick={() => isDone && onNavigate(idx)}
              disabled={!isDone}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`${step.label}${isDone ? ' (concluído)' : isActive ? ' (atual)' : ''}`}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isDone && 'border-success bg-success/10 text-success cursor-pointer hover:bg-success/20',
                isActive && 'border-primary bg-primary text-primary-foreground cursor-default',
                !isDone && !isActive && 'border-muted-foreground/30 bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              {isDone
                ? <Check className="h-5 w-5" aria-hidden="true" />
                : <step.icon className="h-5 w-5" aria-hidden="true" />
              }
            </button>
            {idx < steps.length - 1 && (
              <div className={cn('h-0.5 w-8 mx-1', isDone ? 'bg-success' : 'bg-muted-foreground/20')} aria-hidden="true" />
            )}
          </div>
        )
      })}
    </nav>
  )
}
