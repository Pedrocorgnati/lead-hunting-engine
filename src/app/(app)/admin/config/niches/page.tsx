'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/use-auth'
import { useToast } from '@/lib/hooks/use-toast'
import { Routes } from '@/lib/constants'
import { Plus, Archive, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'

interface Niche {
  id: string
  slug: string
  label: string
  keywords: string[]
  archived: boolean
}

export default function AdminNichesPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const [niches, setNiches] = useState<Niche[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ slug: '', label: '', keywords: '' })

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace(Routes.DASHBOARD)
  }, [isAdmin, authLoading, router])

  const fetchNiches = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/admin/config/niches', { credentials: 'include' })
      if (!res.ok) throw new Error('fetch')
      const { data } = await res.json()
      setNiches(data)
    } catch {
      toast.error('Não foi possível carregar os nichos.')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchNiches() }, [fetchNiches])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const keywords = form.keywords.split(',').map(s => s.trim()).filter(Boolean)
    const res = await fetch('/api/v1/admin/config/niches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ slug: form.slug.toLowerCase(), label: form.label, keywords }),
    })
    if (res.ok) {
      toast.success('Nicho criado.')
      setModalOpen(false)
      setForm({ slug: '', label: '', keywords: '' })
      fetchNiches()
    } else {
      toast.error('Erro ao criar nicho.')
    }
  }

  const toggleArchive = async (n: Niche) => {
    const res = await fetch(`/api/v1/admin/config/niches/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ archived: !n.archived }),
    })
    if (res.ok) {
      toast.success(n.archived ? 'Nicho reativado.' : 'Nicho arquivado.')
      fetchNiches()
    } else {
      toast.error('Erro ao atualizar nicho.')
    }
  }

  if (authLoading || !isAdmin) return null

  return (
    <div data-testid="admin-niches-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nichos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Segmentos de negócio disponíveis para coleta
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} data-testid="admin-niches-add-button">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Novo nicho
        </Button>
      </div>

      <section aria-labelledby="niches-list" className="rounded-lg border bg-card p-6">
        <h2 id="niches-list" className="sr-only">Lista de nichos</h2>

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : niches.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum nicho cadastrado. Rode o seed ou adicione manualmente.
          </p>
        ) : (
          <ul className="divide-y">
            {niches.map(n => (
              <li key={n.id} className="flex items-center justify-between py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{n.label}</span>
                    <Badge variant="outline">{n.slug}</Badge>
                    {n.archived && <Badge variant="secondary">Arquivado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    Palavras-chave: {n.keywords.length > 0 ? n.keywords.join(', ') : 'nenhuma'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleArchive(n)}
                  aria-label={n.archived ? 'Reativar nicho' : 'Arquivar nicho'}
                >
                  {n.archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo nicho">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={e => setForm({ ...form, slug: e.target.value })}
              required
              placeholder="pet-shop"
            />
          </div>
          <div>
            <Label htmlFor="label">Rótulo</Label>
            <Input
              id="label"
              value={form.label}
              onChange={e => setForm({ ...form, label: e.target.value })}
              required
              placeholder="Pet Shops e Veterinárias"
            />
          </div>
          <div>
            <Label htmlFor="keywords">Palavras-chave (separadas por vírgula)</Label>
            <Input
              id="keywords"
              value={form.keywords}
              onChange={e => setForm({ ...form, keywords: e.target.value })}
              placeholder="pet shop, veterinária, banho e tosa"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Criar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
