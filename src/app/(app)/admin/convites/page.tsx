'use client'

import { useState, useEffect } from 'react'
import { Plus, Mail, Send, Trash2, MoreHorizontal, ChevronDown, AlertTriangle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { getInvites, createInvite, resendInvite, revokeInvite, getAuditLog } from '@/actions/invites'
import type { InviteDto, AuditLogEntry } from '@/actions/invites'
import { InviteStatus, INVITE_STATUS_MAP, UserRole } from '@/lib/constants/enums'

const createInviteSchema = z.object({
  email: z.string().min(1, 'E-mail é obrigatório.').email('E-mail inválido.'),
  role: z.nativeEnum(UserRole),
})

type CreateInviteFormData = z.infer<typeof createInviteSchema>

function InviteStatusBadge({ status }: { status: InviteStatus }) {
  const info = INVITE_STATUS_MAP[status]
  return (
    <Badge
      variant={info.variant}
      className={
        status === InviteStatus.PENDING ? 'bg-primary text-primary-foreground' :
        status === InviteStatus.ACCEPTED ? 'bg-muted text-foreground' : ''
      }
    >
      {info.label}
    </Badge>
  )
}

function InviteActions({ invite, onRevoke, onResend }: {
  invite: InviteDto
  onRevoke: (id: string, email: string) => void
  onResend: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const canAct = invite.status === InviteStatus.PENDING || invite.status === InviteStatus.EXPIRED

  if (!canAct) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label={`Ações do convite ${invite.email}`}
        className="p-1.5 rounded hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-20 mt-1 w-40 bg-popover border border-border rounded-lg shadow-lg p-1">
            <button
              onClick={() => { onResend(invite.id); setOpen(false) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent rounded-md transition-colors"
            >
              <Send className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Reenviar
            </button>
            <button
              onClick={() => { onRevoke(invite.id, invite.email); setOpen(false) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Revogar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function CreateInviteModal({ open, onClose, onSuccess }: {
  open: boolean
  onClose: () => void
  onSuccess: (invite: InviteDto) => void
}) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateInviteFormData>({
    resolver: zodResolver(createInviteSchema),
    defaultValues: { role: UserRole.OPERATOR },
  })

  const onSubmit = async (data: CreateInviteFormData) => {
    try {
      await createInvite(data)
      toast.success('Convite enviado com sucesso!')
      reset()
      onSuccess({
        id: crypto.randomUUID(),
        email: data.email,
        role: data.role,
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      })
    } catch {
      toast.error('Erro ao enviar convite. Tente novamente.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar convite</DialogTitle>
        </DialogHeader>
        <form data-testid="admin-convites-modal-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email <span aria-hidden="true">*</span></Label>
            <Input
              id="invite-email"
              data-testid="admin-convites-modal-email-input"
              type="email"
              placeholder="usuario@empresa.com"
              autoFocus
              disabled={isSubmitting}
              aria-required="true"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'invite-email-error' : undefined}
              {...register('email')}
            />
            {errors.email && (
              <p id="invite-email-error" role="alert" className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Papel <span aria-hidden="true">*</span></Label>
            <select
              id="invite-role"
              data-testid="admin-convites-modal-role-select"
              disabled={isSubmitting}
              aria-required="true"
              className="w-full h-10 px-3 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary"
              {...register('role')}
            >
              <option value={UserRole.OPERATOR}>Operador</option>
              <option value={UserRole.ADMIN}>Administrador</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              data-testid="admin-convites-modal-cancel-button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-testid="admin-convites-modal-submit-button"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-80 flex items-center gap-2"
            >
              {isSubmitting && (
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              )}
              {isSubmitting ? 'Enviando...' : 'Enviar convite'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RevokeConfirmDialog({ invite, onConfirm, onCancel }: {
  invite: { id: string; email: string } | null
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!invite) return null
  return (
    <Dialog open={!!invite} onOpenChange={onCancel}>
      <DialogContent className="max-w-sm" role="alertdialog">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <DialogHeader>
            <DialogTitle>Revogar convite</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja revogar o convite de <strong>{invite.email}</strong>? O usuário não conseguirá mais ativar a conta com este link.
          </p>
          <div className="flex gap-2 w-full justify-end">
            <button data-testid="admin-convites-revoke-cancel-button" onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors">
              Cancelar
            </button>
            <button data-testid="admin-convites-revoke-confirm-button" onClick={onConfirm} className="px-4 py-2 bg-destructive text-white text-sm font-medium rounded-lg hover:bg-destructive/90 transition-colors">
              Revogar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AuditLogSection() {
  const [expanded, setExpanded] = useState(false)
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    if (!expanded && logs.length === 0) {
      setLoading(true)
      try { setLogs(await getAuditLog()) } finally { setLoading(false) }
    }
    setExpanded(!expanded)
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        data-testid="admin-convites-audit-toggle"
        onClick={toggle}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        aria-expanded={expanded}
      >
        <span>Histórico de ações</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="border-t border-border">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma entrada no histórico.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">Ação</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">Usuário</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden sm:table-cell">IP</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono text-xs">{log.action}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm">{log.performedBy ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">{log.ipAddress ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminConvitesPage() {
  const [invites, setInvites] = useState<InviteDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; email: string } | null>(null)

  useEffect(() => {
    getInvites()
      .then(setInvites)
      .catch(() => setError('Erro ao carregar convites.'))
      .finally(() => setLoading(false))
  }, [])

  const handleResend = async (id: string) => {
    try {
      await resendInvite(id)
      toast.success('Convite reenviado.')
    } catch {
      toast.error('Erro ao reenviar convite.')
    }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    try {
      await revokeInvite(revokeTarget.id)
      setInvites(prev => prev.map(i => i.id === revokeTarget.id ? { ...i, status: InviteStatus.REVOKED } : i))
      toast.success('Convite revogado.')
    } catch {
      toast.error('Erro ao revogar convite.')
    }
    setRevokeTarget(null)
  }

  return (
    <div data-testid="admin-convites-page" className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Convites</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie o acesso de usuários à plataforma</p>
        </div>
        <button
          data-testid="admin-convites-create-button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo convite
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg p-4 text-sm text-destructive bg-destructive/5 border border-destructive/20">
          {error}
        </div>
      )}

      {/* Table */}
      <div data-testid="admin-convites-table" className="rounded-xl border border-border overflow-hidden bg-card">
        {loading ? (
          <div className="p-4 space-y-3" aria-busy="true">
            <div className="bg-muted/50 px-4 py-3 flex gap-4">
              {[40, 10, 15, 12, 12, 4].map((w, i) => (
                <Skeleton key={i} className={`h-4 w-${w}`} />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-6" />
              </div>
            ))}
          </div>
        ) : invites.length === 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full" aria-label="Lista de convites">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">Email</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden sm:table-cell">Papel</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">Status</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden sm:table-cell">Expira em</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden sm:table-cell">Criado em</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="py-8">
                    <div className="flex flex-col items-center gap-3">
                      <Mail className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <p className="text-sm font-medium text-muted-foreground">Nenhum convite encontrado.</p>
                      <button
                        onClick={() => setCreateOpen(true)}
                        className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent transition-colors"
                      >
                        Criar primeiro convite
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" aria-label="Lista de convites">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">Email</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden sm:table-cell">Papel</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">Status</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden sm:table-cell">Expira em</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden sm:table-cell">Criado em</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invites.map(invite => (
                  <tr key={invite.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{invite.email}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground capitalize hidden sm:table-cell">
                      {invite.role === UserRole.ADMIN ? 'Admin' : 'Operador'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <InviteStatusBadge status={invite.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                      {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                      {new Date(invite.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <InviteActions
                        invite={invite}
                        onResend={handleResend}
                        onRevoke={(id, email) => setRevokeTarget({ id, email })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit log */}
      <AuditLogSection />

      {/* Modals */}
      <CreateInviteModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={invite => { setInvites(prev => [invite, ...prev]); setCreateOpen(false) }}
      />
      <RevokeConfirmDialog
        invite={revokeTarget}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  )
}
