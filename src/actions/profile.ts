'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { profileService, ProfileError } from '@/services/profile.service'
import { UpdateProfileSchema } from '@/schemas/profile.schema'
import { AuditService } from '@/lib/services/audit-service'
import { checkRateLimit } from '@/lib/utils/rate-limiter'

export interface UserProfileDto {
  id: string
  email: string
  name: string
  role: string
  avatarUrl?: string | null
  termsAcceptedAt: string | null
  deletionRequestedAt: string | null
}

export async function getProfile(): Promise<UserProfileDto | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const profile = await prisma.userProfile.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      termsAcceptedAt: true,
      deletionRequestedAt: true,
    },
  })

  if (!profile) return null

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name ?? '',
    role: profile.role,
    termsAcceptedAt: profile.termsAcceptedAt?.toISOString() ?? null,
    deletionRequestedAt: profile.deletionRequestedAt?.toISOString() ?? null,
  }
}

export async function updateProfile(data: { name: string }): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const parsed = UpdateProfileSchema.parse({ name: data.name })
  await profileService.update(user.id, parsed)

  await AuditService.log({
    userId: user.id,
    action: 'user.profile_updated',
    resource: 'user_profiles',
    resourceId: user.id,
    metadata: { fields_updated: Object.keys(parsed).join(',') },
  })

  return { success: true }
}

export async function requestAccountDeletion(): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  // Rate limit: max 3 deletion requests per minute per user
  const { allowed } = checkRateLimit(`deletion:${user.id}`, 3, 60_000)
  if (!allowed) {
    throw new Error('Muitas solicitações. Tente novamente em breve.')
  }

  await profileService.requestDeletion(user.id)

  return { success: true }
}

// M3-G01: cancelamento de solicitacao de exclusao dentro da janela de 15 dias
export async function cancelAccountDeletion(): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  // Reaproveita o bucket de rate limit de exclusao para evitar flap entre solicitar/cancelar
  const { allowed } = checkRateLimit(`deletion:${user.id}`, 3, 60_000)
  if (!allowed) {
    throw new Error('Muitas solicitações. Tente novamente em breve.')
  }

  try {
    await profileService.cancelDeletion(user.id)
  } catch (error) {
    if (error instanceof ProfileError) {
      if (error.type === 'NOT_REQUESTED') {
        throw new Error('Não há solicitação de exclusão ativa para cancelar.')
      }
      if (error.type === 'DEADLINE_PASSED') {
        throw new Error('A janela de 15 dias para cancelar a exclusão expirou.')
      }
    }
    throw error
  }

  revalidatePath('/profile')
  return { success: true }
}

export async function completeOnboarding(): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const profile = await prisma.userProfile.findUnique({
    where: { id: user.id },
    select: { onboardingCompletedAt: true },
  })

  if (!profile?.onboardingCompletedAt) {
    await prisma.userProfile.update({
      where: { id: user.id },
      data: { onboardingCompletedAt: new Date() },
    })
  }

  return { success: true }
}
