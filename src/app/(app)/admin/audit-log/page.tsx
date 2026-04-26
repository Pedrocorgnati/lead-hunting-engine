import { AuditLogTable } from '@/components/admin/AuditLogTable'

export const metadata = {
  title: 'Audit log',
}

export default function AdminAuditLogPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Historico imutavel de acoes de admins e usuarios. Filtre, inspecione o
          payload completo ou exporte para analise.
        </p>
      </div>
      <AuditLogTable />
    </div>
  )
}
