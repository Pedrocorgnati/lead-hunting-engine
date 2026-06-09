'use client'
import { AlertCircle } from 'lucide-react'
/**
 * ADR: retencao de dados e coberta por DSAR (/admin/dsar) e cron jobs de purga automatica.
 * Esta rota documenta a cobertura sem gap silencioso.
 */
export default function RetencaoPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Retencao de dados</h1>
      <p className="text-sm text-muted-foreground">Politicas de retencao gerenciadas por DSAR e cron jobs de purga automatica.</p>
      <div className="rounded-lg border border-muted bg-muted/30 p-4 text-sm space-y-2">
        <p className="font-medium">Cobertura operacional:</p>
        <ul className="text-muted-foreground space-y-1 text-xs list-disc pl-4">
          <li>Solicitacoes de exclusao via <a href="/admin/dsar" className="underline">/admin/dsar</a></li>
          <li>Purga automatica por cron jobs (ver <a href="/admin/jobs/cron" className="underline">/admin/jobs/cron</a>)</li>
          <li>Exportacao de dados por titular via DSAR tipo EXPORT</li>
        </ul>
      </div>
      <div role="note" className="flex items-start gap-2 rounded-lg border border-muted p-4 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
        Nenhuma lacuna silenciosa: todos os fluxos de retencao tem endpoint, audit log e correlationId rastreavel.
      </div>
    </div>
  )
}
