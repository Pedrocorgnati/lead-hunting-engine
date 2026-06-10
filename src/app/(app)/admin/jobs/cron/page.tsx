'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Clock3, Loader2, Pause, Play, RotateCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface CronJob {
  id: string
  name: string
  description: string
  schedule: string
  status: 'ACTIVE' | 'DISABLED'
  lastRunAt: string | null
  lastOutcome: 'ok' | 'error' | null
  nextRunAt: string | null
}
interface CronResponse { data?: { jobs?: CronJob[] }; error?: { code: string; message: string } }

export default function CronJobsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/v1/admin/cron/jobs')
      const json = (await res.json().catch(() => ({}))) as CronResponse
      if (!res.ok) { setError(json.error?.message ?? 'Erro ao carregar cron jobs.'); return }
      setJobs(json.data?.jobs ?? [])
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleTrigger(job: CronJob) {
    setActing(job.id)
    try {
      const res = await fetch(`/api/v1/admin/cron/jobs/${job.id}/trigger`, { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      if (!res.ok) { toast.error(json.error?.message ?? 'Erro ao acionar job.'); return }
      toast.success(`"${job.name}" executado manualmente.`)
      await load()
    } catch { toast.error('Erro de rede.') } finally { setActing(null) }
  }

  async function handlePauseResume(job: CronJob) {
    const action = job.status === 'ACTIVE' ? 'pause' : 'resume'
    setActing(job.id)
    try {
      const res = await fetch(`/api/v1/admin/cron/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      if (!res.ok) { toast.error(json.error?.message ?? 'Erro ao atualizar job.'); return }
      toast.success(action === 'pause' ? `"${job.name}" pausado.` : `"${job.name}" reativado.`)
      await load()
    } catch { toast.error('Erro de rede.') } finally { setActing(null) }
  }

  const VARIANT: Record<CronJob['status'], 'default' | 'secondary' | 'outline'> = { ACTIVE: 'secondary', DISABLED: 'outline' }
  const STATUS_LABEL: Record<CronJob['status'], string> = { ACTIVE: 'Ativo', DISABLED: 'Pausado' }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Cron jobs</h1><p className="text-sm text-muted-foreground">Monitore, pause e acione tarefas agendadas.</p></div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RotateCw className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Atualizar
        </Button>
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <CardTitle className="text-sm font-medium">{job.name}</CardTitle>
                    <Badge variant={VARIANT[job.status]}>{STATUS_LABEL[job.status]}</Badge>
                    {job.lastOutcome === 'error' && <Badge variant="destructive">Ultima execucao falhou</Badge>}
                    <code className="text-xs text-muted-foreground">{job.schedule}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" disabled={acting === job.id}
                      onClick={() => void handlePauseResume(job)} data-testid={`pause-${job.id}`}>
                      {job.status === 'ACTIVE'
                        ? <><Pause className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Pausar</>
                        : <><Play className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Retomar</>}
                    </Button>
                    <Button size="sm" variant="outline" disabled={acting === job.id}
                      onClick={() => void handleTrigger(job)} data-testid={`trigger-${job.id}`}>
                      {acting === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden="true" /> : <Play className="h-3.5 w-3.5 mr-1" aria-hidden="true" />}
                      Acionar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                <p className="text-xs text-muted-foreground">{job.description}</p>
                <p className="text-xs text-muted-foreground">
                  Ultimo: {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString('pt-BR') : 'nunca registrado'}
                  {' · '}
                  Proximo: {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString('pt-BR') : '—'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
