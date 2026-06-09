'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download, UserPlus, CalendarClock, Trash2, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface CohortMember {
  id: string
  email: string
  name: string | null
  role: string
  pilotTags: string[]
  onboardingCompleted: boolean
  joinedAt: string
  leadsCount: number
  lastNpsScore: number | null
  lastNpsAt: string | null
}

interface Kpis {
  cohortSize: number
  onboardingCompleted: number
  onboardingRate: number
  totalLeads: number
  activeJobs: number
  npsResponses: number
  npsAverage: number | null
  periods: string[]
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function PilotProgramDashboard() {
  const [members, setMembers] = useState<CohortMember[]>([])
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [periodFilter, setPeriodFilter] = useState('')

  // Dialog: adicionar participante
  const [addOpen, setAddOpen] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addTag, setAddTag] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  // Dialog: agendar entrevista
  const [interviewFor, setInterviewFor] = useState<CohortMember | null>(null)
  const [interviewWhen, setInterviewWhen] = useState('')
  const [interviewChannel, setInterviewChannel] = useState<'video' | 'phone' | 'in_person'>('video')
  const [interviewNotes, setInterviewNotes] = useState('')
  const [interviewBusy, setInterviewBusy] = useState(false)

  // Remocao
  const [removeTarget, setRemoveTarget] = useState<{ member: CohortMember; tag: string } | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const cohortParams = new URLSearchParams({ limit: '100' })
      const kpisParams = new URLSearchParams()
      if (periodFilter) {
        cohortParams.set('tag', periodFilter)
        kpisParams.set('tag', periodFilter)
      }
      const kpisQuery = kpisParams.toString()
      const [cohortRes, kpisRes] = await Promise.all([
        fetch(`/api/v1/admin/pilot-program/cohort?${cohortParams.toString()}`),
        fetch(`/api/v1/admin/pilot-program/kpis${kpisQuery ? `?${kpisQuery}` : ''}`),
      ])
      if (!cohortRes.ok) throw new Error('Falha ao carregar o cohort do programa piloto.')
      if (!kpisRes.ok) throw new Error('Falha ao carregar os KPIs do programa piloto.')
      const cohortJson = await cohortRes.json()
      const kpisJson = await kpisRes.json()
      setMembers(cohortJson.data ?? [])
      setKpis(kpisJson.data ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setLoading(false)
    }
  }, [periodFilter])

  useEffect(() => {
    void load()
  }, [load])

  async function submitAdd() {
    setAddBusy(true)
    try {
      const res = await fetch('/api/v1/admin/pilot-program/cohort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail.trim(), tag: addTag.trim() }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Falha ao adicionar participante.')
      }
      const json = await res.json()
      toast.success(json.data?.changed === false ? 'Participante ja estava no cohort.' : 'Participante adicionado ao cohort.')
      setAddOpen(false)
      setAddEmail('')
      setAddTag('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setAddBusy(false)
    }
  }

  async function submitInterview() {
    if (!interviewFor) return
    setInterviewBusy(true)
    try {
      const res = await fetch('/api/v1/admin/pilot-program/interviews/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: interviewFor.id,
          scheduledFor: new Date(interviewWhen).toISOString(),
          channel: interviewChannel,
          notes: interviewNotes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Falha ao agendar entrevista.')
      }
      toast.success('Entrevista agendada. O participante foi notificado.')
      setInterviewFor(null)
      setInterviewWhen('')
      setInterviewNotes('')
      setInterviewChannel('video')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setInterviewBusy(false)
    }
  }

  async function submitRemove() {
    if (!removeTarget) return
    setRemoveBusy(true)
    try {
      const { member, tag } = removeTarget
      const res = await fetch(
        `/api/v1/admin/pilot-program/cohort/${member.id}?tag=${encodeURIComponent(tag)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Falha ao remover do cohort.')
      }
      toast.success(`Tag ${tag} removida do participante.`)
      setRemoveTarget(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setRemoveBusy(false)
    }
  }

  const periodOptions = kpis?.periods ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filtrar por periodo do piloto"
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
          >
            <option value="">Todos os periodos</option>
            {periodOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" />
            Adicionar participante
          </Button>
          <a
            href={`/api/v1/admin/pilot-program/export${periodFilter ? `?tag=${encodeURIComponent(periodFilter)}` : ''}`}
            download
            className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exportar relatorio
          </a>
        </div>
      </div>

      {/* KPIs */}
      {loading && !kpis ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : kpis ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Participantes" value={String(kpis.cohortSize)} />
          <KpiCard
            label="Onboarding concluido"
            value={`${kpis.onboardingRate}%`}
            hint={`${kpis.onboardingCompleted}/${kpis.cohortSize}`}
          />
          <KpiCard label="Leads gerados" value={String(kpis.totalLeads)} hint={`${kpis.activeJobs} coletas ativas`} />
          <KpiCard
            label="NPS medio"
            value={kpis.npsAverage !== null ? String(kpis.npsAverage) : '--'}
            hint={`${kpis.npsResponses} respostas`}
          />
        </div>
      ) : null}

      {/* Cohort table */}
      {error ? (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          title="Nenhum participante no programa piloto"
          description="Adicione participantes aplicando uma tag pilot-{periodo}. Eles aparecem aqui com KPIs e opcao de entrevista."
          cta={<Button onClick={() => setAddOpen(true)}>Adicionar participante</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participante</TableHead>
                <TableHead>Periodos</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Ultimo NPS</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{m.name ?? m.email}</div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {m.pilotTags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setRemoveTarget({ member: m, tag: t })}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                          title={`Remover ${t} do cohort`}
                        >
                          {t}
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.onboardingCompleted ? (
                      <Badge variant="outline">Concluido</Badge>
                    ) : (
                      <Badge variant="secondary">Pendente</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.leadsCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.lastNpsScore !== null ? m.lastNpsScore : '--'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setInterviewFor(m)
                        setInterviewWhen('')
                        setInterviewNotes('')
                        setInterviewChannel('video')
                      }}
                    >
                      <CalendarClock className="mr-1 h-4 w-4" aria-hidden="true" />
                      Entrevista
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog: adicionar participante */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar participante</DialogTitle>
            <DialogDescription>
              Informe o email do usuario e o periodo do piloto. Cria a tag pilot-{'{periodo}'} sem duplicar dados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pilot-add-email">Email do usuario</Label>
              <Input
                id="pilot-add-email"
                type="email"
                placeholder="usuario@empresa.com"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pilot-add-tag">Periodo (tag)</Label>
              <Input
                id="pilot-add-tag"
                placeholder="pilot-q2-2026"
                value={addTag}
                onChange={(e) => setAddTag(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Formato pilot-{'{periodo}'}, apenas a-z, 0-9 e hifen.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addBusy}>
              Cancelar
            </Button>
            <Button onClick={() => void submitAdd()} disabled={addBusy || !addEmail.trim() || !addTag.trim()}>
              {addBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: agendar entrevista */}
      <Dialog open={interviewFor !== null} onOpenChange={(o) => !o && setInterviewFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar entrevista</DialogTitle>
            <DialogDescription>
              {interviewFor ? `Participante: ${interviewFor.name ?? interviewFor.email}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pilot-interview-when">Data e hora</Label>
              <Input
                id="pilot-interview-when"
                type="datetime-local"
                value={interviewWhen}
                onChange={(e) => setInterviewWhen(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pilot-interview-channel">Canal</Label>
              <select
                id="pilot-interview-channel"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={interviewChannel}
                onChange={(e) => setInterviewChannel(e.target.value as 'video' | 'phone' | 'in_person')}
              >
                <option value="video">Videochamada</option>
                <option value="phone">Telefone</option>
                <option value="in_person">Presencial</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pilot-interview-notes">Observacao (opcional)</Label>
              <Textarea
                id="pilot-interview-notes"
                rows={3}
                maxLength={500}
                value={interviewNotes}
                onChange={(e) => setInterviewNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInterviewFor(null)} disabled={interviewBusy}>
              Cancelar
            </Button>
            <Button onClick={() => void submitInterview()} disabled={interviewBusy || !interviewWhen}>
              {interviewBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: remover do cohort */}
      <Dialog open={removeTarget !== null} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover do cohort</DialogTitle>
            <DialogDescription>
              {removeTarget
                ? `Remover a tag ${removeTarget.tag} de ${removeTarget.member.name ?? removeTarget.member.email}?`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removeBusy}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void submitRemove()} disabled={removeBusy}>
              {removeBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
