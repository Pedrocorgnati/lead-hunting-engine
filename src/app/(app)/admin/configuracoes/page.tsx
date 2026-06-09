'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/hooks/use-auth'
import { useToast } from '@/lib/hooks/use-toast'
import { Routes } from '@/lib/constants'
import { ArrowRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Modal } from '@/components/ui/modal'
import { CredentialCard } from '@/components/admin/credential-card'
import { CredentialForm } from '@/components/admin/credential-form'
import {
  getCredentials, deleteCredential, testCredential, toggleCredentialActive,
} from '@/actions/config'
import type { CredentialDto } from '@/actions/config'
import { trackEvent } from '@/lib/utils/analytics'

const CONFIG_CARDS = [
  {
    href: Routes.ADMIN_CONFIG_LIMITS,
    title: 'Limites',
    description: 'Ajuste quotas de leads e concorrência de coletas.',
  },
  {
    href: Routes.ADMIN_CONFIG_NICHES,
    title: 'Nichos',
    description: 'Gerencie segmentações e palavras-chave por segmento.',
  },
  {
    href: Routes.ADMIN_CONFIG_REGIONS,
    title: 'Regiões',
    description: 'Defina UFs e cidades disponíveis para coleta.',
  },
  {
    href: Routes.ADMIN_CONFIG_SCRAPERS,
    title: 'Scrapers',
    description: 'Monitore provedores e status de coleta.',
  },
  {
    href: '/admin/configuracoes/privacidade',
    title: 'Privacidade',
    description: 'Política de retenção e limpeza de leads.',
  },
  {
    href: Routes.ADMIN_CONFIG_SCORING,
    title: 'Scoring',
    description: 'Ajuste pesos e regras de composição do score.',
  },
] as const

export default function AdminConfiguracoesPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const [credentials, setCredentials] = useState<CredentialDto[]>([])
  const [loadingCreds, setLoadingCreds] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<{ id: string; provider: string } | undefined>()

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace(Routes.DASHBOARD)
  }, [isAdmin, authLoading, router])

  const fetchCredentials = useCallback(async () => {
    setLoadingCreds(true)
    try {
      const creds = await getCredentials()
      setCredentials(creds)
    } catch {
      // RESOLVED: G004 — Zero Silêncio: erro visível ao usuário
      toast.error('Não foi possível carregar as credenciais. Tente novamente.')
    }
    setLoadingCreds(false)
  }, [])

  useEffect(() => {
    fetchCredentials()
  }, [fetchCredentials])

  const openCreate = () => {
    setEditing(undefined)
    setModalOpen(true)
  }

  const openEdit = (cred: CredentialDto) => {
    setEditing({ id: cred.id, provider: cred.provider })
    setModalOpen(true)
  }

  const handleFormSuccess = () => {
    setModalOpen(false)
    setEditing(undefined)
    fetchCredentials()
  }

  const handleDelete = async (id: string) => {
    const cred = credentials.find(c => c.id === id)
    await deleteCredential(id)
    if (cred) trackEvent('credential_deleted', { provider: cred.provider })
    fetchCredentials()
  }

  const handleTest = async (id: string) => {
    const cred = credentials.find(c => c.id === id)
    const result = await testCredential(id)
    if (cred) trackEvent('credential_tested', { provider: cred.provider, ok: result.success })
    return result
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await toggleCredentialActive(id, isActive)
    fetchCredentials()
  }

  if (authLoading || !isAdmin) return null

  return (
    <div data-testid="admin-config-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Credenciais de API e parâmetros do sistema</p>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-label="Atalhos de configuração">
        {CONFIG_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border bg-card p-4 hover:bg-accent transition-colors min-h-[122px] flex flex-col justify-between gap-4"
            data-testid={`admin-config-shortcut-${card.title.toLowerCase()}`}
          >
            <div>
              <h2 className="text-sm font-semibold text-foreground">{card.title}</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-5">{card.description}</p>
            </div>
            <span className="text-xs text-primary inline-flex items-center gap-1">
              Acessar
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </section>

      {/* Credentials section */}
      <section data-testid="admin-config-credentials-section" aria-labelledby="credentials-heading" className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="credentials-heading" className="text-sm font-semibold text-foreground">Credenciais de API</h2>
            <p className="text-xs text-muted-foreground mt-1">Chaves de acesso aos serviços de dados</p>
          </div>
          <Button
            data-testid="admin-config-add-credential-button"
            onClick={openCreate}
            size="sm"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Adicionar
          </Button>
        </div>

        {loadingCreds ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma credencial configurada. Adicione uma para iniciar coletas.</p>
        ) : (
          <div className="space-y-3">
            {credentials.map(cred => (
              <CredentialCard
                key={cred.id}
                cred={cred}
                onEdit={openEdit}
                onDelete={handleDelete}
                onTest={handleTest}
                onToggleActive={handleToggleActive}
              />
            ))}
          </div>
        )}
      </section>

      {/* Create/Edit credential modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(undefined) }}
        title={editing ? 'Editar credencial' : 'Nova credencial'}
      >
        <CredentialForm
          editing={editing}
          onSuccess={handleFormSuccess}
          onCancel={() => { setModalOpen(false); setEditing(undefined) }}
        />
      </Modal>
    </div>
  )
}
