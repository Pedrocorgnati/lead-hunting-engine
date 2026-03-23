import type { Metadata } from 'next'
import { BarChart3 } from 'lucide-react'

export const metadata: Metadata = { title: 'Métricas' }

export default function MetricasPage() {
  return (
    <div data-testid="metricas-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Métricas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Análise de performance e uso da plataforma
        </p>
      </div>

      <div data-testid="metricas-placeholder" className="rounded-lg border bg-card p-12 flex flex-col items-center justify-center text-center space-y-4">
        <div className="rounded-full bg-muted p-6">
          <BarChart3 className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Métricas em desenvolvimento</p>
          <p className="text-xs text-muted-foreground mt-1">
            Os dashboards de analytics estarão disponíveis após a implementação do backend.
          </p>
        </div>
      </div>
    </div>
  )
}
