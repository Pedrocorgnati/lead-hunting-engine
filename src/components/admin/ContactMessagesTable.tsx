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

type ContactStatus = 'NEW' | 'READ' | 'REPLIED' | 'ARCHIVED'

interface ContactMessage {
  id: string
  email: string
  name: string
  subject: string
  message: string
  status: ContactStatus
  createdAt: string
  repliedAt: string | null
}

export function ContactMessagesTable() {
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'' | ContactStatus>('')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (q) params.set('q', q)
      const res = await fetch(`/api/v1/admin/contact-messages?${params.toString()}`)
      if (!res.ok) throw new Error('Falha ao listar mensagens')
      const json = await res.json()
      setMessages(json.data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, q])

  useEffect(() => {
    void load()
  }, [load])

  const selected = messages.find((m) => m.id === selectedId) ?? null

  async function sendReply() {
    if (!selected) return
    if (reply.trim().length < 5) {
      toast.error('Escreva uma resposta mais completa.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/admin/contact-messages/${selected.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyContent: reply.trim() }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Falha ao responder')
      }
      toast.success('Resposta registrada.')
      setSelectedId(null)
      setReply('')
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
          placeholder="Buscar por email, nome ou assunto"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
          aria-label="Buscar"
        />
        <select
          aria-label="Filtro por status"
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | ContactStatus)}
        >
          <option value="">Todos status</option>
          <option value="NEW">Novo</option>
          <option value="READ">Lido</option>
          <option value="REPLIED">Respondido</option>
          <option value="ARCHIVED">Arquivado</option>
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
              <TableHead>Assunto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recebido em</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-xs">{m.email}</TableCell>
                <TableCell>{m.name}</TableCell>
                <TableCell className="max-w-xs truncate">{m.subject}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      m.status === 'REPLIED'
                        ? 'default'
                        : m.status === 'ARCHIVED'
                          ? 'outline'
                          : 'secondary'
                    }
                  >
                    {m.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(m.createdAt).toLocaleDateString('pt-BR')}
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedId(m.id)}>
                    Ver & Responder
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {messages.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhuma mensagem encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedId(null)
            setReply('')
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.subject}</DialogTitle>
            <DialogDescription>
              De <strong>{selected?.name}</strong> ({selected?.email})
              {selected?.createdAt &&
                ` — ${new Date(selected.createdAt).toLocaleString('pt-BR')}`}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap">
            {selected?.message}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="reply-content" className="text-sm font-medium">
              Sua resposta
            </label>
            <textarea
              id="reply-content"
              rows={5}
              maxLength={5000}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              disabled={busy || selected?.status === 'REPLIED'}
              placeholder="Escreva aqui. Esse conteudo fica registrado; o envio efetivo e manual ou via integracao de email configurada."
              className="w-full rounded-md border border-input bg-background p-2 text-sm text-foreground focus:ring-2 focus:ring-ring"
            />
            {selected?.status === 'REPLIED' && (
              <p className="text-xs text-muted-foreground">
                Esta mensagem ja foi marcada como respondida.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedId(null)
                setReply('')
              }}
              disabled={busy}
            >
              Fechar
            </Button>
            <Button
              onClick={sendReply}
              disabled={busy || selected?.status === 'REPLIED' || reply.trim().length < 5}
            >
              {busy ? 'Enviando...' : 'Registrar resposta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
