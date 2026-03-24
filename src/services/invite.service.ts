import { prisma } from '@/lib/prisma'
import { AuthService } from '@/lib/services/auth-service'
import { AuditService } from '@/lib/services/audit-service'
import { InviteStatus, UserRole } from '@/lib/constants/enums'
import type { CreateInviteInput, ActivateAccountInput } from '@/schemas/invite.schema'
import type { Invite } from '@prisma/client'
import { randomBytes } from 'crypto'

/** Código de erro embutido nas exceções de convite */
export class InviteError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'InviteError'
  }
}

const INVITE_TTL_DAYS = Number(process.env.INVITE_TTL_DAYS ?? 7)

export class InviteService {
  async findAll(filters?: {
    page?: number
    limit?: number
  }): Promise<{ data: Invite[]; total: number }> {
    const page = filters?.page ?? 1
    const limit = filters?.limit ?? 20
    const skip = (page - 1) * limit

    const [data, total] = await Promise.all([
      prisma.invite.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.invite.count(),
    ])
    return { data, total }
  }

  async create(data: CreateInviteInput, invitedById: string): Promise<Invite> {
    // Verificar se email já tem conta
    const existingProfile = await prisma.userProfile.findUnique({
      where: { email: data.email },
    })
    if (existingProfile) {
      throw new InviteError('INVITE_020', 'Este email já possui uma conta ativa.')
    }

    // Verificar convite pendente
    const existingInvite = await prisma.invite.findFirst({
      where: { email: data.email, status: InviteStatus.PENDING },
    })
    if (existingInvite) {
      throw new InviteError('INVITE_021', 'Já existe um convite pendente para este email.')
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (data.expiresInDays ?? INVITE_TTL_DAYS))

    const token = randomBytes(32).toString('hex')

    return prisma.invite.create({
      data: {
        email: data.email,
        role: data.role as UserRole,
        token,
        expiresAt,
        invitedById,
        status: InviteStatus.PENDING,
      },
    })
  }

  /** Retorna dados do convite ou null se não encontrado.
   *  Inclui status e expiresAt para que o caller aplique COMP-004. */
  async findByToken(token: string): Promise<{
    email: string
    role: string
    status: string
    expiresAt: Date
  } | null> {
    return prisma.invite.findUnique({
      where: { token },
      select: { email: true, role: true, status: true, expiresAt: true },
    })
  }

  /**
   * Ativa conta via convite.
   * COMP-003: grava termsAcceptedAt + audit log.
   * COMP-004: valida TTL e status server-side antes de qualquer operação.
   */
  async activate(
    token: string,
    data: ActivateAccountInput
  ): Promise<{ userId: string; email: string }> {
    // COMP-004: buscar e validar convite
    const invite = await prisma.invite.findUnique({ where: { token } })

    if (!invite) {
      throw new InviteError('INVITE_080', 'Convite não encontrado ou inválido.')
    }

    // COMP-004: validar status E TTL explicitamente (não confiar apenas em status)
    if (invite.status === InviteStatus.ACCEPTED) {
      throw new InviteError('INVITE_051', 'Este convite já foi utilizado.')
    }
    if (invite.status !== InviteStatus.PENDING || invite.expiresAt < new Date()) {
      throw new InviteError('INVITE_050', 'Este convite expirou.')
    }

    // Criar usuário no Supabase Auth
    const { data: authData, error: authError } = await AuthService.createInvite(invite.email, {
      data: { role: invite.role },
    })

    if (authError || !authData.user) {
      const err = new InviteError('AUTH_004', 'Erro ao criar conta. Tente novamente.')
      // Logar erro técnico sem expor detalhes
      console.error('[InviteService.activate] Supabase Auth error:', authError?.message)
      throw err
    }

    const userId = authData.user.id

    // Primeiro usuário vira ADMIN automaticamente
    const userCount = await prisma.userProfile.count()
    const role = userCount === 0 ? UserRole.ADMIN : (invite.role as UserRole)

    // COMP-003: transação atômica — UserProfile com termsAcceptedAt + status do convite
    await prisma.$transaction([
      prisma.userProfile.upsert({
        where: { id: userId },
        update: { termsAcceptedAt: new Date() },
        create: {
          id: userId,
          email: invite.email,
          name: invite.email.split('@')[0],
          role,
          termsAcceptedAt: new Date(), // COMP-003: obrigatório — NOT NULL na lógica de negócio
        },
      }),
      prisma.invite.update({
        where: { id: invite.id },
        data: {
          status: InviteStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      }),
    ])

    // COMP-003: Audit log do consentimento LGPD (best-effort — não bloqueia ativação)
    try {
      await AuditService.log({
        userId,
        action: 'terms.accepted',
        resource: 'user_profiles',
        resourceId: userId,
        metadata: {
          terms_accepted_at: new Date().toISOString(),
          invite_email: invite.email,
          invite_token_prefix: token.substring(0, 8) + '...',
        },
      })
    } catch (auditError) {
      // Audit failure must never block activation (COMP-003 best-effort)
      console.error('[InviteService.activate] Audit log failed:', auditError)
    }

    // Sign-in automático após ativação para criar sessão httpOnly
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    await supabase.auth.signInWithPassword({
      email: invite.email,
      password: data.password,
    })

    return { userId, email: invite.email }
  }

  async resend(inviteId: string): Promise<Invite> {
    const invite = await prisma.invite.findUnique({ where: { id: inviteId } })
    if (!invite) throw new InviteError('INVITE_080', 'Convite não encontrado.')

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS)

    return prisma.invite.update({
      where: { id: inviteId },
      data: { expiresAt, updatedAt: new Date(), status: InviteStatus.PENDING },
    })
  }

  async revoke(inviteId: string): Promise<void> {
    await prisma.invite.update({
      where: { id: inviteId },
      data: { status: InviteStatus.REVOKED },
    })
  }
}

export const inviteService = new InviteService()
