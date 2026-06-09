'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Clock3, Loader2, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface CronJob { id: string; name: string; schedule: string; status: 'ACTIVE' | 'DISABLED' | 'RUNNING'; lastRunAt: string | null; nextRunAt: string | null }
interface CronResponse { data?: CronJob[] | { jobs: CronJob[] }; error?: { code: string; message: string } }

export default function CronJobsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/v1/admin/cron/jobs')
      const json = (await res.json().catch(() => ({}))) as CronResponse
      if (!res.ok) { setError(json.error?.message ?? 'Erro ao carregar cron jobs.'); return }
      const list = Array.isArray(json.data) ? json.data : (json.data as {jobs:CronJob[]})?.jobs ?? []
      setJobs(list)
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleTrigger(id: string) {
    setTriggering(id)
    try {
      const res = await fetch(`/api/v1/admin/cron/jobs/${id}/trigger`, { method: 'POST' })
      if (!res.ok) { toast.error('Erro ao acionar job.'); return }
      toast.success('Job acionado manualmente.')
      await load()
    } catch { toast.error('Erro de rede.') } finally { setTriggering(null) }
  }

  const VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = { ACTIVE: 'secondary', DISABLED: 'outline', RUNNING: 'default' }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Cron jobs</h1><p className="text-sm text-muted-foreground">Monitore e acione tarefas agendadas.</p></div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>Atualizar</Button>
      </div>
      {loading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" /></div>}
      {!loading && error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2"><AlertCircle className="h-4 w-4" aria-hidden="true" />{error}</div>}
      {!loading && !error && jobs.length === 0 && <div role="status" className="text-center py-12 text-sm text-muted-foreground">Nenhum cron job configurado.</div>}
      {!loading && !error && jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.id} data-testid={`cron-${job.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <CardTitle className="text-sm font-medium">{job.name}</CardTitle>
                    <Badge variant={VARIANT[job.status] ?? 'outline'}>{job.status}</Badge>
                    <code className="text-xs text-muted-foreground">{job.schedule}</code>
                  </div>
                  <Button size="sm" variant="outline" disabled={!!triggering || job.status === 'RUNNING'}
                    onClick={() => void handleTrigger(job.id)} data-testid={`trigger-${job.id}`}>
                    {triggering === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden /> : <Play className="h-3.5 w-3.5 mr-1" aria-hidden />}
                    Acionar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {job.lastRunAt && <p className="text-xs text-muted-foreground">Ultimo: {new Date(job.lastRunAt).toLocaleString('pt-BR')}</p>}
                {job.nextRunAt && <p className="text-xs text-muted-foreground">Proximo: {new Date(job.nextRunAt).toLocaleString('pt-BR')}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
