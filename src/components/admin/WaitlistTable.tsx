'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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

type WaitlistStatus = 'PENDING' | 'INVITED' | 'REJECTED'

interface WaitlistEntry {
  id: string
  email: string
  name: string | null
  businessType: string | null
  status: WaitlistStatus
  invitedAt: string | null
  createdAt: string
}

export function WaitlistTable() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'' | WaitlistStatus>('')
  const [q, setQ] = useState('')
  const [confirmInviteId, setConfirmInviteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (q) params.set('q', q)
      const res = await fetch(`/api/v1/admin/waitlist?${params.toString()}`)
      if (!res.ok) throw new Error('Falha ao listar waitlist')
      const json = await res.json()
      setEntries(json.data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, q])

  useEffect(() => {
    void load()
  }, [load])

  const target = entries.find((e) => e.id === confirmInviteId) ?? null

  async function sendInvite() {
    if (!target) return
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/admin/waitlist/${target.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'OPERATOR' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Falha ao convidar')
      }
      toast.success('Convite enviado.')
      setConfirmInviteId(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          placeholder="Buscar por email ou nome"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
          aria-label="Buscar"
        />
        <select
          aria-label="Filtro por status"
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | WaitlistStatus)}
        >
          <option value="">Todos status</option>
          <option value="PENDING">Pendentes</option>
          <option value="INVITED">Convidados</option>
          <option value="REJECTED">Rejeitados</option>
        </select>
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
              <TableHead>Segmento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Inscrito em</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const isPending = entry.status === 'PENDING'
              return (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs">{entry.email}</TableCell>
                  <TableCell>{entry.name ?? '—'}</TableCell>
                  <TableCell>{entry.businessType ?? '—'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        entry.status === 'INVITED'
                          ? 'default'
                          : entry.status === 'REJECTED'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      disabled={!isPending}
                      onClick={() => setConfirmInviteId(entry.id)}
                    >
                      Convidar
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhuma entrada encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={Boolean(confirmInviteId)}
        onOpenChange={(o) => !o && setConfirmInviteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar convite</DialogTitle>
            <DialogDescription>
              Criar convite para <strong>{target?.email}</strong> como OPERATOR?
              Um email sera enviado com link de ativacao.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmInviteId(null)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button onClick={sendInvite} disabled={busy}>
              {busy ? 'Enviando...' : 'Confirmar e enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
