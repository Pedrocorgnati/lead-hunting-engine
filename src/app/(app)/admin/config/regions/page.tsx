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

interface Region {
  id: string
  uf: string
  name: string
  capital: string
  cities: string[]
  archived: boolean
}

export default function AdminRegionsPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ uf: '', name: '', capital: '', cities: '' })

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace(Routes.DASHBOARD)
  }, [isAdmin, authLoading, router])

  const fetchRegions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/admin/config/regions', { credentials: 'include' })
      if (!res.ok) throw new Error('fetch')
      const { data } = await res.json()
      setRegions(data)
    } catch {
      toast.error('Não foi possível carregar as regiões.')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchRegions() }, [fetchRegions])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const cities = form.cities.split(',').map(s => s.trim()).filter(Boolean)
    const res = await fetch('/api/v1/admin/config/regions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ uf: form.uf.toUpperCase(), name: form.name, capital: form.capital, cities }),
    })
    if (res.ok) {
      toast.success('Região criada.')
      setModalOpen(false)
      setForm({ uf: '', name: '', capital: '', cities: '' })
      fetchRegions()
    } else {
      toast.error('Erro ao criar região.')
    }
  }

  const toggleArchive = async (region: Region) => {
    const res = await fetch(`/api/v1/admin/config/regions/${region.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ archived: !region.archived }),
    })
    if (res.ok) {
      toast.success(region.archived ? 'Região reativada.' : 'Região arquivada.')
      fetchRegions()
    } else {
      toast.error('Erro ao atualizar região.')
    }
  }

  if (authLoading || !isAdmin) return null

  return (
    <div data-testid="admin-regions-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Regiões</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie UFs e cidades disponíveis para coleta
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} data-testid="admin-regions-add-button">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Nova região
        </Button>
      </div>

      <section aria-labelledby="regions-list" className="rounded-lg border bg-card p-6">
        <h2 id="regions-list" className="sr-only">Lista de regiões</h2>

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : regions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma região cadastrada. Rode o seed ou adicione manualmente.
          </p>
        ) : (
          <ul className="divide-y">
            {regions.map(r => (
              <li key={r.id} className="flex items-center justify-between py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{r.uf}</Badge>
                    <span className="font-medium text-foreground">{r.name}</span>
                    {r.archived && <Badge variant="secondary">Arquivada</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    Capital: {r.capital} · Cidades: {r.cities.length > 0 ? r.cities.join(', ') : 'nenhuma'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleArchive(r)}
                  aria-label={r.archived ? 'Reativar região' : 'Arquivar região'}
                >
                  {r.archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova região"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="uf">UF</Label>
            <Input
              id="uf"
              value={form.uf}
              onChange={e => setForm({ ...form, uf: e.target.value })}
              maxLength={2}
              required
              placeholder="SP"
            />
          </div>
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
              placeholder="São Paulo"
            />
          </div>
          <div>
            <Label htmlFor="capital">Capital</Label>
            <Input
              id="capital"
              value={form.capital}
              onChange={e => setForm({ ...form, capital: e.target.value })}
              required
              placeholder="São Paulo"
            />
          </div>
          <div>
            <Label htmlFor="cities">Cidades (separadas por vírgula)</Label>
            <Input
              id="cities"
              value={form.cities}
              onChange={e => setForm({ ...form, cities: e.target.value })}
              placeholder="São Paulo, Campinas, Santos"
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
