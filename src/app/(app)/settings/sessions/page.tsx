'use client'

/**
 * TASK-17 intake-review (CL-042, CL-468): UI de sessoes ativas.
 * Permite ao usuario ver e encerrar sessoes remotas.
 */
import { useEffect, useState } from 'react'
import { Loader2, LogOut, Monitor, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/lib/hooks/use-toast'

interface Session {
  id: string
  createdAt: string
  lastActiveAt: string | null
  userAgent: string | null
  ip: string | null
  isCurrent: boolean
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function shortUa(ua: string | null): string {
  if (!ua) return 'Dispositivo desconhecido'
  const m = /\(([^)]+)\).*?(?:Firefox|Chrome|Safari|Edge)\/?[\d.]*/.exec(ua)
  return m ? `${m[0].split(')')[0]})` : ua.slice(0, 60)
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const toast = useToast()

  const load = async () => {
    setError(null)
    try {
      const r = await fetch('/api/v1/profile/sessions', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { data: { sessions: Session[] } }
      setSessions(json.data.sessions)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar sessões')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const revoke = async (id: string) => {
    setRevoking(id)
    try {
      const r = await fetch(`/api/v1/profile/sessions/${id}`, { method: 'DELETE' })
      if (r.status === 409) {
        toast.error('Você não pode encerrar a sessão atual.')
        return
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      toast.success('Sessão encerrada.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao encerrar sessão')
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div data-testid="sessions-page" className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6" aria-hidden="true" />
          Sessões ativas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dispositivos em que sua conta está conectada agora. Encerre qualquer sessão que não reconhecer.
        </p>
      </div>

      {sessions === null && !error ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando…
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-4 text-sm text-destructive">
            {error}
            <Button variant="outline" size="sm" className="ml-3" onClick={load}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : sessions && sessions.length === 0 ? (
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            Nenhuma sessão ativa encontrada. Sua sessão atual pode estar em propagação — recarregue em instantes.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="sessions-list">
          {sessions?.map((s) => (
            <li key={s.id}>
              <Card
                className={s.isCurrent ? 'border-primary/50 bg-primary/5' : ''}
                data-testid={`session-item-${s.id}`}
              >
                <CardContent className="flex items-start gap-4 pt-4">
                  <div className="rounded-lg bg-muted p-3" aria-hidden="true">
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{shortUa(s.userAgent)}</p>
                      {s.isCurrent ? (
                        <span className="text-xs rounded-full bg-primary px-2 py-0.5 text-primary-foreground">
                          Esta sessão
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      IP: {s.ip ?? '—'} · Criada: {fmtDate(s.createdAt)} · Última atividade: {fmtDate(s.lastActiveAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={s.isCurrent || revoking === s.id}
                    onClick={() => revoke(s.id)}
                    aria-label={`Encerrar sessão ${shortUa(s.userAgent)}`}
                  >
                    {revoking === s.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <LogOut className="h-4 w-4 mr-1" aria-hidden="true" />
                    )}
                    Encerrar
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
