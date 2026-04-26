import { AlertCircle } from 'lucide-react'
import { getSignalDefinition } from '@/lib/intelligence/signals/opportunity-signals'

/**
 * TASK-4 intake-review (ST004): lista de sinais de oportunidade granulares
 * disparados para o lead, em pt-BR com descricao.
 */

export interface SignalsListProps {
  signals: string[]
}

export function SignalsList({ signals }: SignalsListProps) {
  if (!signals || signals.length === 0) {
    return (
      <div data-testid="signals-list-empty" className="text-sm text-muted-foreground">
        Nenhum sinal de oportunidade disparado.
      </div>
    )
  }

  return (
    <ul data-testid="signals-list" className="space-y-2">
      {signals.map((slug) => {
        const def = getSignalDefinition(slug)
        const label = def?.label_ptBR ?? slug
        const description = def?.description ?? null

        return (
          <li
            key={slug}
            data-testid={`signal-item-${slug}`}
            className="flex items-start gap-2 rounded-md border border-border bg-card p-3"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 text-warning shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">{label}</div>
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
