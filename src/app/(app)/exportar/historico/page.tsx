import type { Metadata } from 'next'
import { ExportHistoryTable } from '@/components/exports/ExportHistoryTable'

/**
 * /exportar/historico — rota canonica do historico de exportacoes (A17).
 *
 * Reaproveita a implementacao real de /exports (ExportHistoryTable: contrato
 * {data: ExportRow[]}, polling 10s p/ PENDING/PROCESSING, download seguro com
 * TTL, regenerar e remover com ConfirmDialog G6). /exports permanece como
 * alias legado montando o mesmo componente.
 */
export const metadata: Metadata = { title: 'Historico de exportacoes' }

export default function ExportarHistoricoPage() {
  return (
    <div className="space-y-6" data-testid="exportar-historico-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Historico de exportacoes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Baixe novamente, regenere ou remova exportacoes anteriores. Links expiram apos o TTL configurado.
        </p>
      </div>
      <ExportHistoryTable />
    </div>
  )
}
