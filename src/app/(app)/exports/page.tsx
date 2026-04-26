import type { Metadata } from 'next'
import { ExportHistoryTable } from '@/components/exports/ExportHistoryTable'

/**
 * /exports — historico do usuario com re-download e status live.
 * Origem: TASK-22 intake-review / ST005 (CL-296, CL-492).
 */
export const metadata: Metadata = { title: 'Minhas exportacoes' }

export default function ExportsPage() {
  return (
    <div className="space-y-6" data-testid="exports-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Minhas exportacoes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Historico dos ultimos arquivos gerados. Links expiram apos o TTL configurado.
        </p>
      </div>
      <ExportHistoryTable />
    </div>
  )
}
