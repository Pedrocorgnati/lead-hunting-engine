import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TriggerCleanupButton } from './_components/TriggerCleanupButton'
import { RetentionStatusCard } from '@/components/admin/RetentionStatusCard'

export default async function PrivacyPage() {
  await requireAdmin()

  const expiring = await prisma.lead.findMany({
    where: { retentionUntil: { not: null } },
    orderBy: { retentionUntil: 'asc' },
    take: 20,
    select: { id: true, businessName: true, retentionUntil: true, status: true },
  })

  const lastCleanup = await prisma.auditLog.findFirst({
    where: { action: 'RETENTION_CLEANUP' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, metadata: true },
  })

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Privacidade e LGPD</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Politica de retencao: leads descartados sao excluidos automaticamente apos 15 dias.
        </p>
      </div>

      <RetentionStatusCard />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Status da politica de retencao</CardTitle>
          <TriggerCleanupButton />
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Ultimo cleanup automatico:{' '}
            {lastCleanup
              ? format(lastCleanup.createdAt, "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })
              : 'Nunca executado'}
          </p>
          {lastCleanup?.metadata && typeof lastCleanup.metadata === 'object' && (
            <p className="text-muted-foreground">
              Registros excluidos:{' '}
              {(lastCleanup.metadata as Record<string, unknown>).deleted as number ?? 0} leads /{' '}
              {(lastCleanup.metadata as Record<string, unknown>).rawDeleted as number ?? 0} dados brutos
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proximos {expiring.length} leads a expirar</CardTitle>
        </CardHeader>
        <CardContent>
          {expiring.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lead agendado para exclusao.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Empresa</th>
                  <th className="pb-2 text-left">Status</th>
                  <th className="pb-2 text-left">Expira em</th>
                </tr>
              </thead>
              <tbody>
                {expiring.map(lead => (
                  <tr key={lead.id} className="border-b last:border-0">
                    <td className="py-2">{lead.businessName}</td>
                    <td className="py-2">
                      <Badge variant="secondary">{lead.status}</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {lead.retentionUntil
                        ? format(lead.retentionUntil, 'dd/MM/yyyy', { locale: ptBR })
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
