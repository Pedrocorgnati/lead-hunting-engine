import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

interface LastRun {
  executedAt: Date
  deleted: number
  rawDeleted: number
  durationMs: number | null
}

async function loadData(): Promise<{ lastRun: LastRun | null; in7days: number; in30days: number }> {
  const now = new Date()
  const [lastRunRaw, in7days, in30days] = await Promise.all([
    prisma.auditLog.findFirst({
      where: { action: 'RETENTION_CLEANUP' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, metadata: true },
    }),
    prisma.lead.count({ where: { retentionUntil: { gte: now, lt: addDays(now, 7) } } }),
    prisma.lead.count({ where: { retentionUntil: { gte: now, lt: addDays(now, 30) } } }),
  ])

  const metadata =
    lastRunRaw?.metadata && typeof lastRunRaw.metadata === 'object'
      ? (lastRunRaw.metadata as Record<string, unknown>)
      : null

  const lastRun: LastRun | null = lastRunRaw
    ? {
        executedAt: lastRunRaw.createdAt,
        deleted: (metadata?.deleted as number) ?? 0,
        rawDeleted: (metadata?.rawDeleted as number) ?? 0,
        durationMs: (metadata?.durationMs as number) ?? null,
      }
    : null

  return { lastRun, in7days, in30days }
}

export async function RetentionStatusCard() {
  const { lastRun, in7days, in30days } = await loadData()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retencao LGPD</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {lastRun ? (
          <div className="space-y-1">
            <p>
              Ultima execucao:{' '}
              <span className="font-medium">
                {format(lastRun.executedAt, "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}
              </span>
            </p>
            <p className="text-muted-foreground">
              Registros excluidos: {lastRun.deleted} leads / {lastRun.rawDeleted} dados brutos
              {lastRun.durationMs !== null && <> (em {lastRun.durationMs}ms)</>}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Cron ainda nao executou — agendado para 03:00 diariamente.
          </p>
        )}

        <div>
          <p className="mb-2 font-medium">Proximos a expirar</p>
          <div className="flex gap-2">
            <Badge variant="secondary">{in7days} em 7 dias</Badge>
            <Badge variant="secondary">{in30days} em 30 dias</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
