import { prisma } from '@/lib/prisma'
import { AuditService } from '@/lib/services/audit-service'
import type { UpdateProfileInput } from '@/schemas/profile.schema'
import type { UserProfile } from '@prisma/client'
import { DELETION_CANCEL_WINDOW_DAYS, DELETION_CANCEL_WINDOW_MS } from '@/lib/constants/profile'

export { DELETION_CANCEL_WINDOW_DAYS, DELETION_CANCEL_WINDOW_MS }

export type ProfileErrorType =
  | 'NOT_FOUND'
  | 'DUPLICATE_DELETION'
  | 'NOT_REQUESTED'
  | 'DEADLINE_PASSED'

export class ProfileError extends Error {
  type: ProfileErrorType
  constructor(type: ProfileErrorType) {
    super(type)
    this.type = type
    this.name = 'ProfileError'
  }
}

export class ProfileService {
  async findById(userId: string): Promise<UserProfile | null> {
    return prisma.userProfile.findUnique({ where: { id: userId } })
  }

  async update(userId: string, data: UpdateProfileInput): Promise<UserProfile> {
    const profile = await this.findById(userId)
    if (!profile) throw new ProfileError('NOT_FOUND')

    return prisma.userProfile.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      },
    })
  }

  async requestDeletion(userId: string, ipAddress?: string): Promise<void> {
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { deletionRequestedAt: true },
    })

    if (!profile) throw new ProfileError('NOT_FOUND')
    if (profile.deletionRequestedAt) throw new ProfileError('DUPLICATE_DELETION')

    await prisma.userProfile.update({
      where: { id: userId },
      data: { deletionRequestedAt: new Date() },
    })

    await AuditService.log({
      userId,
      action: 'user.deletion_requested',
      resource: 'user_profiles',
      resourceId: userId,
      metadata: { requested_at: new Date().toISOString() },
      ipAddress,
    })
  }

  async cancelDeletion(userId: string, ipAddress?: string): Promise<void> {
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { deletionRequestedAt: true },
    })

    if (!profile) throw new ProfileError('NOT_FOUND')
    if (!profile.deletionRequestedAt) throw new ProfileError('NOT_REQUESTED')

    const requestedAt = profile.deletionRequestedAt
    const now = new Date()
    const elapsedMs = now.getTime() - requestedAt.getTime()
    if (elapsedMs > DELETION_CANCEL_WINDOW_MS) {
      throw new ProfileError('DEADLINE_PASSED')
    }

    await prisma.userProfile.update({
      where: { id: userId },
      data: { deletionRequestedAt: null },
    })

    const daysElapsed = Math.floor(elapsedMs / (24 * 60 * 60 * 1000))
    const daysRemaining = Math.max(0, DELETION_CANCEL_WINDOW_DAYS - daysElapsed)

    await AuditService.log({
      userId,
      action: 'user.deletion_cancelled',
      resource: 'user_profiles',
      resourceId: userId,
      metadata: {
        requested_at: requestedAt.toISOString(),
        canceled_at: now.toISOString(),
        days_remaining: daysRemaining,
      },
      ipAddress,
    })
  }

  /**
   * DSAR (LGPD Art. 18 V) — Exporta TODOS os dados pessoais do usuario
   * em estrutura JSON serializavel.
   *
   * Constraints:
   *  - Janela de auditoria: ultimos 12 meses (performance).
   *  - Login attempts: ultimos 30 dias.
   *  - Sessoes nao sao expostas (modelo Session inexistente; tokens de sessao
   *    moram no NextAuth/JWT e nunca devem sair do server-side de qualquer forma).
   *  - Campos sensiveis NAO incluidos: passwordHash, encryptedKey, refreshToken,
   *    rawJson de leads (pode conter PII de terceiros nao-consentido).
   */
  async exportData(userId: string, ipAddress?: string): Promise<UserDataExport> {
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        termsAcceptedAt: true,
        deletionRequestedAt: true,
        onboardingCompletedAt: true,
        onboardingStep: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!profile) throw new ProfileError('NOT_FOUND')

    const now = new Date()
    const auditWindowStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    const loginWindowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [
      collectionJobs,
      leads,
      rawLeadData,
      pitchTemplates,
      auditLogs,
      invitesSent,
      contactEvents,
      leadTags,
      savedViews,
      notifications,
      notificationPreferences,
      pushSubscriptions,
      loginAttempts,
    ] = await Promise.all([
      prisma.collectionJob.findMany({ where: { userId } }),
      prisma.lead.findMany({ where: { userId } }),
      prisma.rawLeadData.findMany({
        where: { userId },
        // rawJson pode conter PII de terceiros nao-consentido — excluir
        select: {
          id: true,
          jobId: true,
          source: true,
          sourceUrl: true,
          collectedAt: true,
          businessName: true,
          phone: true,
          phoneNormalized: true,
          address: true,
          city: true,
          state: true,
          website: true,
          email: true,
          category: true,
          rating: true,
          reviewCount: true,
          enrichmentStatus: true,
          leadId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.pitchTemplate.findMany({ where: { userId } }),
      prisma.auditLog.findMany({
        where: { userId, createdAt: { gte: auditWindowStart } },
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invite.findMany({
        where: { invitedById: userId },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          expiresAt: true,
          acceptedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.contactEvent.findMany({ where: { userId } }),
      prisma.leadTag.findMany({ where: { userId } }),
      prisma.savedView.findMany({ where: { userId } }),
      prisma.notification.findMany({ where: { userId } }),
      prisma.notificationPreference.findMany({ where: { userId } }),
      prisma.pushSubscription.findMany({
        where: { userId },
        // p256dh/auth/endpoint sao tokens — nao expor
        select: {
          id: true,
          userAgent: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.loginAttempt.findMany({
        where: { email: profile.email, timestamp: { gte: loginWindowStart } },
        select: {
          id: true,
          email: true,
          ipAddress: true,
          success: true,
          timestamp: true,
        },
      }),
    ])

    const rowCounts: Record<string, number> = {
      collection_jobs: collectionJobs.length,
      leads: leads.length,
      raw_lead_data: rawLeadData.length,
      pitch_templates: pitchTemplates.length,
      audit_logs: auditLogs.length,
      invites_sent: invitesSent.length,
      contact_events: contactEvents.length,
      lead_tags: leadTags.length,
      saved_views: savedViews.length,
      notifications: notifications.length,
      notification_preferences: notificationPreferences.length,
      push_subscriptions: pushSubscriptions.length,
      login_attempts: loginAttempts.length,
    }

    await AuditService.log({
      userId,
      action: 'profile.data_exported',
      resource: 'user_profiles',
      resourceId: userId,
      metadata: {
        exported_at: now.toISOString(),
        ...rowCounts,
      },
      ipAddress,
    })

    return {
      version: '1.0',
      exported_at: now.toISOString(),
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        avatar_url: profile.avatarUrl,
        terms_accepted_at: profile.termsAcceptedAt,
        deletion_requested_at: profile.deletionRequestedAt,
        onboarding_completed_at: profile.onboardingCompletedAt,
        onboarding_step: profile.onboardingStep,
        created_at: profile.createdAt,
        updated_at: profile.updatedAt,
      },
      collection_jobs: collectionJobs,
      leads,
      raw_lead_data: rawLeadData,
      pitch_templates: pitchTemplates,
      audit_logs: auditLogs,
      invites_sent: invitesSent,
      contact_events: contactEvents,
      lead_tags: leadTags,
      saved_views: savedViews,
      notifications,
      notification_preferences: notificationPreferences,
      push_subscriptions: pushSubscriptions,
      login_attempts: loginAttempts,
      row_counts: rowCounts,
    }
  }
}

/**
 * DSAR (Data Subject Access Request) — LGPD Art. 18 V.
 * Estrutura serializavel com TODOS os dados pessoais do usuario.
 * Nao inclui campos sensiveis cripto/auth (passwordHash, refreshToken,
 * encryptedKey, rawJson de fontes externas).
 */
export interface UserDataExport {
  version: '1.0'
  exported_at: string
  user: {
    id: string
    email: string
    name: string | null
    role: string
    avatar_url: string | null
    terms_accepted_at: Date | null
    deletion_requested_at: Date | null
    onboarding_completed_at: Date | null
    onboarding_step: number
    created_at: Date
    updated_at: Date
  } | null
  collection_jobs: unknown[]
  leads: unknown[]
  raw_lead_data: unknown[]
  pitch_templates: unknown[]
  audit_logs: unknown[]
  invites_sent: unknown[]
  contact_events: unknown[]
  lead_tags: unknown[]
  saved_views: unknown[]
  notifications: unknown[]
  notification_preferences: unknown[]
  push_subscriptions: unknown[]
  login_attempts: unknown[]
  row_counts: Record<string, number>
}

export const profileService = new ProfileService()
