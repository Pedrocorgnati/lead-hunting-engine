'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/use-auth'
import { useToast } from '@/lib/hooks/use-toast'
import { Routes } from '@/lib/constants'
import { formatDate } from '@/lib/utils/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

interface Provider {
  source: string
  label: string
  tier: 'OFFICIAL_API' | 'INTERMEDIARY' | 'HEADLESS'
  category: 'BUSINESS' | 'SOCIAL' | 'LLM' | 'OTHER'
  enabled: boolean
  hasCredential: boolean
  usageCount: number
  lastUsed: string | null
}

const TIER_LABEL: Record<Provider['tier'], string> = {
  OFFICIAL_API: 'API oficial',
  INTERMEDIARY: 'Intermediário',
  HEADLESS:     'Headless',
}

const CATEGORY_LABEL: Record<Provider['category'], string> = {
  BUSINESS: 'Negócios',
  SOCIAL:   'Redes sociais',
  LLM:      'IA / LLM',
  OTHER:    'Outros',
}

export default function AdminScrapersPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace(Routes.DASHBOARD)
  }, [isAdmin, authLoading, router])

  const fetchProviders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/admin/config/providers', { credentials: 'include' })
      if (!res.ok) throw new Error('fetch')
      const { data } = await res.json()
      setProviders(data)
    } catch {
      toast.error('Não foi possível carregar os providers.')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchProviders() }, [fetchProviders])

  if (authLoading || !isAdmin) return null

  const grouped = providers.reduce<Record<Provider['category'], Provider[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {} as Record<Provider['category'], Provider[]>)

  return (
    <div data-testid="admin-scrapers-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Scrapers e Providers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visão geral dos provedores de dados configurados no sistema
        </p>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhum provider disponível.
        </p>
      ) : (
        (Object.keys(grouped) as Array<Provider['category']>).map(category => (
          <section key={category} aria-labelledby={`cat-${category}`} className="space-y-3">
            <h2 id={`cat-${category}`} className="text-sm font-semibold text-foreground">
              {CATEGORY_LABEL[category]}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {grouped[category].map(p => (
                <article
                  key={p.source}
                  data-testid={`provider-card-${p.source}`}
                  className="rounded-lg border bg-card p-4 space-y-2"
                >
                  <header className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground truncate">{p.label}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{p.source}</p>
                    </div>
                    <Badge variant={p.enabled ? 'default' : 'secondary'}>
                      {p.enabled ? 'Ativo' : p.hasCredential ? 'Inativo' : 'Sem credencial'}
                    </Badge>
                  </header>

                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Tier</dt>
                      <dd className="font-medium text-foreground">{TIER_LABEL[p.tier]}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Uso</dt>
                      <dd className="font-medium text-foreground">{p.usageCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Última atualização</dt>
                      <dd className="font-medium text-foreground">
                        {p.lastUsed ? formatDate(new Date(p.lastUsed)) : '—'}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
