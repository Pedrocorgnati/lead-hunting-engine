import { DedupReport } from '@/components/admin/DedupReport'

export const metadata = { title: 'Relatorio de dedup' }

export default function DedupReportPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Relatorio de deduplicacao</h1>
        <p className="text-sm text-muted-foreground">
          Janela 7 e 30 dias. Taxa de undo indica possiveis falsos positivos.
        </p>
      </div>
      <DedupReport />
    </div>
  )
}
