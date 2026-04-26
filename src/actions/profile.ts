'use server'

import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { profileService } from '@/services/profile.service'
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
