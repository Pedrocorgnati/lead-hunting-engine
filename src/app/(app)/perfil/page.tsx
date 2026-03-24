'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ProfileForm } from '@/components/profile/profile-form'
import { DeletionRequestSection } from '@/components/profile/deletion-request-section'
import { getProfile } from '@/actions/profile'
import type { UserProfileDto } from '@/actions/profile'

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
          <DeletionRequestSection deletionRequestedAt={profile.deletionRequestedAt} />
        </>
      ) : null}
    </div>
  )
}
