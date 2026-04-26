'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { AvatarUploader } from '@/components/profile/AvatarUploader'
import { updateProfile } from '@/actions/profile'
import type { UserProfileDto } from '@/actions/profile'
import { UserRole, Messages } from '@/lib/constants'
import { formatDate } from '@/lib/utils/format'

const profileSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
})

type ProfileFormData = z.infer<typeof profileSchema>

function RoleLabel(role: string) {
  return role === UserRole.ADMIN ? 'Administrador' : 'Operador'
}

interface ProfileFormProps {
  profile: UserProfileDto
  onProfileUpdate?: (name: string) => void
}

export function ProfileForm({ profile, onProfileUpdate }: ProfileFormProps) {
  const [, setAvatarUrl] = useState(profile.avatarUrl ?? null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: profile.name },
  })

  async function onSubmit(data: ProfileFormData) {
    try {
      await updateProfile(data)
      toast.success(Messages.SUCCESS.PROFILE_UPDATED)
      onProfileUpdate?.(data.name)
    } catch {
      toast.error(Messages.ERROR.PROFILE_SAVE)
    }
  }

  return (
    <form data-testid="perfil-form" onSubmit={handleSubmit(onSubmit)} className="rounded-lg border bg-card p-6 space-y-6">
      {/* Avatar */}
      <AvatarUploader
        initialUrl={profile.avatarUrl ?? null}
        displayName={profile.name || 'U'}
        onChange={setAvatarUrl}
      />

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
          <span className="font-medium text-foreground">{profile.email}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Papel</span>
          <span className="font-medium text-foreground">{RoleLabel(profile.role)}</span>
        </div>
        {profile.termsAcceptedAt && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Termos aceitos</span>
            <span className="font-medium text-foreground">
              {formatDate(profile.termsAcceptedAt)}
            </span>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-start">
        <Button
          type="submit"
          data-testid="perfil-form-submit-button"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
        </Button>
      </div>
    </form>
  )
}
