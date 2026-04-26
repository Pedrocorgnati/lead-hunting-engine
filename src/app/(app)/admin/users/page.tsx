'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface AdminUser {
  id: string
  email: string
  name: string | null
  role: 'ADMIN' | 'OPERATOR'
  deactivatedAt: string | null
  createdAt: string
}

type RoleFilter = '' | 'ADMIN' | 'OPERATOR'
type StatusFilter = '' | 'active' | 'deactivated'

type ConfirmKind =
  | 'role'
  | 'deactivate'
  | 'reactivate'
  | 'invalidate-sessions'
  | 'force-reset'

interface Confirmation {
  kind: ConfirmKind
  user: AdminUser
  newRole?: 'ADMIN' | 'OPERATOR'
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [confirm, setConfirm] = useState<Confirmation | null>(null)
  const [busy, setBusy] = useState(false)
  // TASK-4/ST003: challenge digitando email do alvo para acoes destrutivas
  const [emailChallenge, setEmailChallenge] = useState('')
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (roleFilter) params.set('role', roleFilter)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/v1/admin/users?${params.toString()}`)
      if (!res.ok) throw new Error('Falha ao listar usuários')
      const json = await res.json()
      setUsers(json.data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [roleFilter, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  function resetConfirm() {
    setConfirm(null)
    setEmailChallenge('')
    setReason('')
  }

  async function applyConfirm() {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.kind === 'role' && confirm.newRole) {
        const res = await fetch(`/api/v1/admin/users/${confirm.user.id}/role`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-confirm': 'true' },
          body: JSON.stringify({ role: confirm.newRole }),
        })
        if (!res.ok) throw new Error('Falha ao alterar role')
        toast.success(`Role alterada para ${confirm.newRole}`)
      } else if (confirm.kind === 'invalidate-sessions') {
        const res = await fetch(
          `/api/v1/admin/users/${confirm.user.id}/invalidate-sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason.trim() || undefined }),
          },
        )
        if (!res.ok) {
          const json = await res.json().catch(() => null)
          throw new Error(json?.error?.message ?? 'Falha ao encerrar sessões')
        }
        toast.success('Sessões encerradas e usuário notificado.')
      } else if (confirm.kind === 'force-reset') {
        const res = await fetch(
          `/api/v1/admin/users/${confirm.user.id}/force-reset`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason.trim() || undefined }),
          },
        )
        if (!res.ok) {
          const json = await res.json().catch(() => null)
          throw new Error(json?.error?.message ?? 'Falha ao forcar reset')
        }
        toast.success('Reset forcado. Usuario sera obrigado a trocar a senha.')
      } else {
        const active = confirm.kind === 'reactivate'
        const res = await fetch(`/api/v1/admin/users/${confirm.user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active }),
        })
        if (!res.ok) throw new Error('Falha ao atualizar usuário')
        toast.success(active ? 'Usuário reativado' : 'Usuário desativado')
      }
      resetConfirm()
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setBusy(false)
    }
  }

  const isInvalidateKind = confirm?.kind === 'invalidate-sessions'
  const isForceResetKind = confirm?.kind === 'force-reset'
  const requiresChallenge = isInvalidateKind || isForceResetKind
  const challengeOk = !requiresChallenge
    || emailChallenge.trim().toLowerCase() === confirm?.user.email.toLowerCase()

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Gestão de usuários</h1>
        <p className="text-sm text-muted-foreground">
          Administre roles, ative/desative contas e encerre sessões.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Filtro por role"
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
        >
          <option value="">Todas roles</option>
          <option value="ADMIN">ADMIN</option>
          <option value="OPERATOR">OPERATOR</option>
        </select>
        <select
          aria-label="Filtro por status"
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="">Todos status</option>
          <option value="active">Ativos</option>
          <option value="deactivated">Desativados</option>
        </select>

        {/* TASK-17/ST003 (CL-476): exportar CSV respeitando filtros */}
        <a
          href={`/api/v1/admin/users/export?${new URLSearchParams({
            ...(roleFilter ? { role: roleFilter } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
          }).toString()}`}
          download
          className="ml-auto inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent transition-colors"
          data-testid="admin-users-export-csv"
        >
          Exportar CSV
        </a>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const deactivated = Boolean(u.deactivatedAt)
              const newRole = u.role === 'ADMIN' ? 'OPERATOR' : 'ADMIN'
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell>{u.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={deactivated ? 'destructive' : 'outline'}>
                      {deactivated ? 'Desativado' : 'Ativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfirm({ kind: 'role', user: u, newRole })
                      }
                    >
                      {newRole === 'ADMIN' ? 'Promover' : 'Rebaixar'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfirm({ kind: 'invalidate-sessions', user: u })
                      }
                      title="Desloga o usuário de todos os dispositivos"
                    >
                      Encerrar sessões
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfirm({ kind: 'force-reset', user: u })
                      }
                      disabled={deactivated}
                      title="Obriga o usuário a trocar de senha na próxima sessão"
                    >
                      Forçar troca de senha
                    </Button>
                    <Button
                      variant={deactivated ? 'default' : 'destructive'}
                      size="sm"
                      onClick={() =>
                        setConfirm({
                          kind: deactivated ? 'reactivate' : 'deactivate',
                          user: u,
                        })
                      }
                    >
                      {deactivated ? 'Reativar' : 'Desativar'}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && resetConfirm()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isInvalidateKind
                ? 'Encerrar todas as sessões'
                : isForceResetKind
                  ? 'Forçar troca de senha'
                  : 'Confirmar ação'}
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === 'role' &&
                `Alterar role de ${confirm.user.email} para ${confirm.newRole}?`}
              {confirm?.kind === 'deactivate' &&
                `Desativar a conta de ${confirm.user.email}? O usuário não poderá mais acessar o sistema.`}
              {confirm?.kind === 'reactivate' &&
                `Reativar a conta de ${confirm.user.email}?`}
              {isInvalidateKind && (
                <>
                  Isso irá deslogar <strong>{confirm?.user.email}</strong> de
                  todos os dispositivos imediatamente. O usuário será notificado
                  e precisará fazer login novamente. Digite o email do usuário
                  para confirmar.
                </>
              )}
              {isForceResetKind && (
                <>
                  Isso enviará um link de recovery para{' '}
                  <strong>{confirm?.user.email}</strong>, derrubará todas as
                  sessões ativas e obrigará o usuário a definir uma nova senha
                  antes de acessar qualquer outra página. Digite o email para
                  confirmar.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {requiresChallenge && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="email-challenge"
                  className="text-sm font-medium text-foreground"
                >
                  Digite o email do usuário <span className="text-destructive">*</span>
                </label>
                <Input
                  id="email-challenge"
                  type="email"
                  placeholder={confirm?.user.email}
                  autoComplete="off"
                  value={emailChallenge}
                  onChange={(e) => setEmailChallenge(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="reason"
                  className="text-sm font-medium text-foreground"
                >
                  Motivo (opcional)
                </label>
                <Input
                  id="reason"
                  type="text"
                  placeholder="Ex: suspeita de acesso nao autorizado"
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={resetConfirm} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant={isInvalidateKind ? 'destructive' : 'default'}
              onClick={applyConfirm}
              disabled={busy || !challengeOk}
            >
              {busy
                ? 'Processando...'
                : isInvalidateKind
                  ? 'Encerrar sessões'
                  : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
