'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Paperclip, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface Attachment {
  id: string
  url: string
  filename: string
  mimeType: string
  size: number
  createdAt: string
}

interface AttachmentsProps {
  leadId: string
}

const MAX = 10 * 1024 * 1024

export function Attachments({ leadId }: AttachmentsProps) {
  const [items, setItems] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/attachments`)
      if (!res.ok) throw new Error('Falha ao listar anexos')
      const json = await res.json()
      setItems(json.data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load])

  async function upload(file: File) {
    if (file.size > MAX) {
      toast.error('Arquivo excede 10MB')
      return
    }
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/attachments`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error('Upload falhou')
      toast.success('Anexo enviado')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/attachments?attachmentId=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Falha ao remover')
      toast.success('Anexo removido')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    }
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void upload(file)
        }}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-6 text-sm transition ${
          dragging ? 'bg-muted' : 'hover:bg-muted/50'
        }`}
      >
        <Upload className="h-4 w-4" />
        <span>Arraste ou clique para enviar (máx 10MB)</span>
        <input
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
          }}
        />
      </label>

      {loading ? (
        <Skeleton className="h-10 w-full" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum anexo.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 hover:underline"
              >
                <Paperclip className="h-4 w-4" />
                {a.filename}
                <span className="text-xs text-muted-foreground">
                  ({Math.round(a.size / 1024)} KB)
                </span>
              </a>
              <Button variant="ghost" size="sm" onClick={() => remove(a.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
