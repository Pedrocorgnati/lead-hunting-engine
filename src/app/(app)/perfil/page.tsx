'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { getProfile, updateProfile } from '@/actions/profile'
import type { UserProfileDto } from '@/actions/profile'
import { UserRole } from '@/lib/constants/enums'

const profileSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres.').max(100),
})

type ProfileFormData = z.infer<typeof profileSchema>

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

function RoleLabel(role: string) {
  return role === UserRole.ADMIN ? 'Administrador' : 'Operador'
}

export default function PerfilPage() {
  const [profile, setProfile] = useState<UserProfileDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletionPending, setDeletionPending] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  })

  useEffect(() => {
    getProfile().then(p => {
      setProfile(p)
      if (p) reset({ name: p.name })
    }).finally(() => setLoading(false))
  }, [reset])

  const onSubmit = async (data: ProfileFormData) => {
    try {
      await updateProfile(data)
      toast.success('Perfil atualizado com sucesso.')
      setProfile(prev => prev ? { ...prev, name: data.name } : prev)
    } catch {
      toast.error('Erro ao atualizar perfil. Tente novamente.')
    }
  }

  const handleDeletionRequest = async () => {
    if (!confirm('Tem certeza que deseja solicitar a exclusão da sua conta? Esta ação é irreversível.')) return
    setDeletionPending(true)
    toast.error('Funcionalidade não disponível. Execute /auto-flow execute.')
  }

  return (
    <div data-testid="perfil-page" className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-foreground">Perfil</h1>

      {loading ? (
        <ProfileSkeleton />
      ) : (
        <>
          {/* Profile form */}
          <form data-testid="perfil-form" onSubmit={handleSubmit(onSubmit)} className="rounded-lg border bg-card p-6 space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <AvatarInitials name={profile?.name || 'U'} size="lg" />
              <div>
                <p className="text-sm font-medium text-foreground">Foto de perfil</p>
                <p className="text-xs text-muted-foreground">Gerada automaticamente a partir do nome</p>
              </div>
            </div>

            {/* Name input */}
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                data-testid="perfil-form-name-input"
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
                {...register('name')}
              />
              {errors.name && (
                <p id="name-error" role="alert" className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Info card */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">E-mail</span>
                <span className="font-medium text-foreground">{profile?.email ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Papel</span>
                <span className="font-medium text-foreground">{profile ? RoleLabel(profile.role) : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Termos aceitos</span>
                <span className="font-medium text-foreground">
                  {profile?.termsAcceptedAt
                    ? new Date(profile.termsAcceptedAt).toLocaleDateString('pt-BR')
                    : '—'}
                </span>
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-start">
              <button
                type="submit"
                data-testid="perfil-form-submit-button"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="w-full sm:w-auto px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2 justify-center min-h-[44px]"
              >
                {isSubmitting && (
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                )}
                {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>

          {/* Deletion section */}
          <div data-testid="perfil-danger-zone" className="rounded-lg border border-destructive/20 bg-card p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Zona de perigo</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Solicitar a exclusão da sua conta removerá permanentemente todos os seus dados após confirmação da equipe.
                </p>
              </div>
            </div>
            <button
              data-testid="perfil-delete-account-button"
              onClick={handleDeletionRequest}
              disabled={deletionPending}
              className="px-4 py-2 border border-destructive/50 text-destructive text-sm font-medium rounded-lg hover:bg-destructive/5 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {deletionPending ? 'Solicitação enviada' : 'Solicitar exclusão de conta'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
