'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
  Monitor,
  Shield,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual'),
  newPassword: z.string().min(8, 'Minimo 8 caracteres'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, { message: 'Senhas nao coincidem.', path: ['confirmPassword'] })

type PasswordForm = z.infer<typeof ChangePasswordSchema>

interface Session {
  id: string
  createdAt: string
  lastActiveAt: string | null
  userAgent: string | null
  ip: string | null
  isCurrent: boolean
}

interface LoginAttempt {
  id: string
  ipAddress: string
  success: boolean
  timestamp: string
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

export default function PerfilSegurancaPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [isRevokingAll, setIsRevokingAll] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PasswordForm>({
    resolver: zodResolver(ChangePasswordSchema),
  })

  async function onChangePassword(data: PasswordForm) {
    setError(null)
    try {
      const res = await fetch('/api/v1/auth/update-password', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: data.newPassword, currentPassword: data.currentPassword }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
        setError(body?.error?.message ?? 'Erro ao alterar senha.')
        toast.error(body?.error?.message ?? 'Erro ao alterar senha.')
        return
      }
      const body = (await res.json().catch(() => ({}))) as { data?: { forceRelogin?: boolean; message?: string } }
      toast.success(body?.data?.message ?? 'Senha alterada com sucesso.')
      reset()
      if (body?.data?.forceRelogin) {
        toast.info('Sua sessao foi encerrada por seguranca. Redirecionando para o login...')
        setTimeout(() => router.push('/login'), 1500)
      }
    } catch { setError('Erro de rede.'); toast.error('Erro de rede.') }
  }

  async function handleRevokeAll() {
    setIsRevokingAll(true)
    try {
      const res = await fetch('/api/v1/profile/sessions/revoke-all', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json().catch(() => ({}))) as { data?: { forceRelogin?: boolean; message?: string } }
      toast.success(body?.data?.message ?? 'Todas as sessoes encerradas. Faca login novamente.')
      if (body?.data?.forceRelogin) {
        setTimeout(() => router.push('/login'), 1500)
      }
    } catch {
      toast.error('Erro ao encerrar sessoes.')
    } finally {
      setIsRevokingAll(false)
      setConfirmRevoke(false)
    }
  }

  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const loadSessions = async () => {
    setSessionsError(null)
    try {
      const r = await fetch('/api/v1/profile/sessions', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { data: { sessions: Session[] } }
      setSessions(json.data.sessions)
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : 'Erro ao carregar sessoes')
    }
  }

  const revokeSession = async (id: string) => {
    setRevokingId(id)
    try {
      const r = await fetch(`/api/v1/profile/sessions/${id}`, { method: 'DELETE' })
      if (r.status === 409) {
        toast.error('Voce nao pode encerrar a sessao atual.')
        return
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      toast.success('Sessao encerrada.')
      await loadSessions()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao encerrar sessao')
    } finally {
      setRevokingId(null)
    }
  }

  const [attempts, setAttempts] = useState<LoginAttempt[] | null>(null)
  const [attemptsError, setAttemptsError] = useState<string | null>(null)

  const loadAttempts = async () => {
    setAttemptsError(null)
    try {
      const r = await fetch('/api/v1/profile/login-attempts', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { data: { attempts: LoginAttempt[] } }
      setAttempts(json.data.attempts)
    } catch (e) {
      setAttemptsError(e instanceof Error ? e.message : 'Erro ao carregar tentativas de login')
    }
  }

  useEffect(() => {
    loadSessions()
    loadAttempts()
  }, [])

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Seguranca da conta</h1>
        <p className="text-sm text-muted-foreground">Gerencie sua senha, sessoes ativas e historico de login.</p>
      </div>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" aria-hidden="true" /> Alterar senha
          </CardTitle>
          <CardDescription>Use uma senha forte e unica.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onChangePassword)} className="space-y-4" noValidate>
            <div className="space-y-1">
              <Label htmlFor="currentPassword">Senha atual</Label>
              <Input id="currentPassword" type="password" autoComplete="current-password" disabled={isSubmitting}
                aria-describedby={errors.currentPassword ? 'curr-pw-err' : undefined}
                {...register('currentPassword')} />
              {errors.currentPassword && <p id="curr-pw-err" role="alert" className="text-xs text-destructive">{errors.currentPassword.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="newPassword">Nova senha</Label>
              <Input id="newPassword" type="password" autoComplete="new-password" disabled={isSubmitting}
                aria-describedby={errors.newPassword ? 'new-pw-err' : undefined}
                {...register('newPassword')} />
              {errors.newPassword && <p id="new-pw-err" role="alert" className="text-xs text-destructive">{errors.newPassword.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <Input id="confirmPassword" type="password" autoComplete="new-password" disabled={isSubmitting}
                aria-describedby={errors.confirmPassword ? 'conf-pw-err' : undefined}
                {...register('confirmPassword')} />
              {errors.confirmPassword && <p id="conf-pw-err" role="alert" className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>
            {error && (
              <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}
              </div>
            )}
            <Button type="submit" disabled={isSubmitting} data-testid="change-password-btn">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />}
              Alterar senha
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-4 w-4" aria-hidden="true" /> Sessoes ativas
          </CardTitle>
          <CardDescription>Dispositivos em que sua conta esta conectada. Encerre qualquer sessao que nao reconhecer.</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions === null && !sessionsError ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Carregando...
            </div>
          ) : sessionsError ? (
            <div className="text-sm text-destructive">
              {sessionsError}
              <Button variant="outline" size="sm" className="ml-3" onClick={loadSessions}>
                Tentar novamente
              </Button>
            </div>
          ) : sessions && sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma sessao ativa encontrada.</p>
          ) : (
            <ul className="space-y-3" data-testid="sessions-list">
              {sessions?.map((s) => (
                <li key={s.id}>
                  <Card className={s.isCurrent ? 'border-primary/50 bg-primary/5' : ''} data-testid={`session-item-${s.id}`}>
                    <CardContent className="flex items-start gap-4 pt-4">
                      <div className="rounded-lg bg-muted p-3" aria-hidden="true">
                        <Monitor className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{shortUa(s.userAgent)}</p>
                          {s.isCurrent ? (
                            <span className="text-xs rounded-full bg-primary px-2 py-0.5 text-primary-foreground">
                              Esta sessao
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          IP: {s.ip ?? '—'} · Criada: {fmtDate(s.createdAt)} · Ultima atividade: {fmtDate(s.lastActiveAt)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={s.isCurrent || revokingId === s.id}
                        onClick={() => revokeSession(s.id)}
                        aria-label={`Encerrar sessao ${shortUa(s.userAgent)}`}
                      >
                        {revokingId === s.id ? (
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

          <div className="mt-4 pt-4 border-t">
            <Button variant="destructive" size="sm" onClick={() => setConfirmRevoke(true)} data-testid="revoke-sessions-btn" disabled={isRevokingAll}>
              {isRevokingAll ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden="true" />
              ) : (
                <LogOut className="h-4 w-4 mr-1" aria-hidden="true" />
              )}
              Encerrar todas as sessoes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Login attempts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" aria-hidden="true" /> Historico de login
          </CardTitle>
          <CardDescription>Tentativas de login nos ultimos 30 dias.</CardDescription>
        </CardHeader>
        <CardContent>
          {attempts === null && !attemptsError ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Carregando...
            </div>
          ) : attemptsError ? (
            <div className="text-sm text-destructive">
              {attemptsError}
              <Button variant="outline" size="sm" className="ml-3" onClick={loadAttempts}>
                Tentar novamente
              </Button>
            </div>
          ) : attempts && attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tentativa de login registrada.</p>
          ) : (
            <ul className="space-y-2" data-testid="login-attempts-list">
              {attempts?.map((a) => (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  {a.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
                  )}
                  <span className={a.success ? 'text-green-700' : 'text-destructive'}>
                    {a.success ? 'Sucesso' : 'Falha'}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">IP: {a.ipAddress}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{fmtDate(a.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Encerrar todas as sessoes"
        description="Voce sera desconectado de todos os dispositivos. Deseja continuar?"
        confirmLabel="Encerrar sessoes"
        danger
        onConfirm={() => void handleRevokeAll()}
        onCancel={() => setConfirmRevoke(false)}
      />
    </div>
  )
}
