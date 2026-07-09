'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ShieldCheck, Lock, BellRing, MonitorSmartphone, ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ProfileForm } from '@/components/profile/profile-form'
import { DeletionRequestSection } from '@/components/profile/deletion-request-section'
import { getProfile } from '@/actions/profile'
import type { UserProfileDto } from '@/actions/profile'
import { Routes } from '@/lib/constants/routes'

const PROFILE_LINKS = [
  {
    href: Routes.PERFIL_SEGURANCA,
    label: 'Segurança',
    description: 'Senha, reautenticação e proteção da conta',
    icon: Lock,
  },
  {
    href: Routes.PERFIL_PRIVACIDADE,
    label: 'Privacidade',
    description: 'Consentimentos, exportação de dados e DSAR',
    icon: ShieldCheck,
  },
  {
    href: Routes.NOTIFICACOES_PREFERENCIAS,
    label: 'Preferências de notificação',
    description: 'Canais, eventos e horário não-perturbe',
    icon: BellRing,
  },
  {
    href: Routes.PERFIL_SEGURANCA,
    label: 'Sessões ativas',
    description: 'Dispositivos conectados à sua conta',
    icon: MonitorSmartphone,
  },
]

function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-10 w-40" />
    </div>
  )
}

export default function PerfilPage() {
  const [profile, setProfile] = useState<UserProfileDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  async function loadProfile() {
    setLoading(true)
    setError(false)
    try {
      const p = await getProfile()
      setProfile(p)
    } catch {
      setError(true)
      toast.error('Erro ao carregar perfil. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProfile() }, [])

  return (
    <div data-testid="perfil-page" className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-foreground">Perfil</h1>

      {loading ? (
        <ProfileSkeleton />
      ) : error ? (
        <div className="rounded-lg border bg-card p-6 text-center space-y-4">
          <p className="text-sm text-muted-foreground">Não foi possível carregar seu perfil.</p>
          <Button variant="outline" onClick={loadProfile}>
            Tentar novamente
          </Button>
        </div>
      ) : profile ? (
        <>
          <ProfileForm
            profile={profile}
            onProfileUpdate={(name) => setProfile(prev => prev ? { ...prev, name } : prev)}
          />

          <nav aria-label="Configurações da conta" className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Conta</h2>
            <ul className="divide-y rounded-lg border bg-card">
              {PROFILE_LINKS.map(({ href, label, description, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    data-testid={`perfil-link-${href.replaceAll('/', '-').slice(1)}`}
                    className="flex items-center gap-3 p-4 hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-foreground">{label}</span>
                      <span className="block text-xs text-muted-foreground">{description}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <DeletionRequestSection deletionRequestedAt={profile.deletionRequestedAt} />
        </>
      ) : null}
    </div>
  )
}
