'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { AvatarInitials } from '@/components/shared/avatar-initials'
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
  const [avatarUrl] = useState(profile.avatarUrl ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  function handleAvatarClick() {
    toast.info(Messages.INFO.AVATAR_COMING_SOON)
  }

  return (
    <form data-testid="perfil-form" onSubmit={handleSubmit(onSubmit)} className="rounded-lg border bg-card p-6 space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleAvatarClick}
          className="relative group cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Trocar foto de perfil"
          role="button"
        >
          <AvatarInitials name={profile.name || 'U'} size="lg" />
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
            <Camera className="h-5 w-5 text-white" />
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium text-foreground">Foto de perfil</p>
          <p className="text-xs text-muted-foreground">JPG, PNG. Máx 2MB.</p>
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
