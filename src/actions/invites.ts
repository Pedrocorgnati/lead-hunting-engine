'use server'

import { headers } from 'next/headers'
import { requireAdmin } from '@/lib/auth'
import { inviteService, InviteError } from '@/services/invite.service'
import { AuditService } from '@/lib/services/audit-service'
import { EmailService } from '@/lib/services/email-service'
import { prisma } from '@/lib/prisma'
import { InviteStatus, UserRole } from '@/lib/constants/enums'
import type { Invite } from '@prisma/client'

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface InviteDto {
  id: string
  email: string
  role: UserRole
  status: InviteStatus
  expiresAt: string | null
  createdAt: string
}

export interface AuditLogEntry {
  id: string
  action: string
  performedBy: string | null
  ipAddress: string | null
  createdAt: string
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function toInviteDto(invite: Invite): InviteDto {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role as UserRole,
    status: invite.status as InviteStatus,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  }
}

function buildInviteUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${baseUrl}/invite/${token}`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getClientIp(): Promise<string | undefined> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0].trim() ?? h.get('x-real-ip') ?? undefined
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Retorna todos os convites ordenados por data de criação (mais recente primeiro). */
export async function getInvites(): Promise<InviteDto[]> {
  await requireAdmin()
  const { data } = await inviteService.findAll({ page: 1, limit: 100 })
  return data.map(toInviteDto)
}

/**
 * Cria novo convite, envia email e registra audit log.
 * Lança InviteError com code INVITE_020 ou INVITE_021 se duplicado.
 */
export async function createInvite(input: {
  email: string
  role: UserRole
}): Promise<{ id: string }> {
  const admin = await requireAdmin()

  const invite = await inviteService.create(
    { email: input.email, role: input.role, expiresInDays: 7 },
    admin.id
  )

  // Enviar email de convite (Resend ou fallback Supabase Auth — best-effort)
  try {
    await EmailService.sendInvite(invite.email, buildInviteUrl(invite.token))
  } catch {
    // Falha de email não bloqueia criação do convite
  }

  // Audit log — email armazenado apenas como prefixo (COMP-001)
  await AuditService.log({
    userId: admin.id,
    action: 'invite.created',
    resource: 'invites',
    resourceId: invite.id,
    metadata: {
      emailPrefix: invite.email.split('@')[0],
      role: invite.role,
    },
    ipAddress: await getClientIp(),
  })

  return { id: invite.id }
}

/**
 * Reenvia convite renovando expiração (+7 dias).
 * Lança InviteError com code INVITE_080 se não encontrado.
 */
export async function resendInvite(id: string): Promise<{ success: boolean }> {
  const admin = await requireAdmin()

  const updated = await inviteService.resend(id)

  // Reenviar email com mesmo token (URL permanece válida, TTL renovado)
  try {
    await EmailService.sendInvite(updated.email, buildInviteUrl(updated.token))
  } catch {
    // Falha de email não bloqueia operação (best-effort)
  }

  // Audit log
  await AuditService.log({
    userId: admin.id,
    action: 'invite.resent',
    resource: 'invites',
    resourceId: id,
    metadata: {
      emailPrefix: updated.email.split('@')[0],
      newExpiresAt: updated.expiresAt.toISOString(),
    },
    ipAddress: await getClientIp(),
  })

  return { success: true }
}

/**
 * Revoga convite (status → REVOKED).
 * Lança InviteError com code INVITE_080 se não encontrado.
 * Lança InviteError com code INVITE_090 se convite não está PENDING.
 */
export async function revokeInvite(id: string): Promise<{ success: boolean }> {
  const admin = await requireAdmin()

  const invite = await prisma.invite.findUnique({
    where: { id },
    select: { email: true, status: true },
  })

  if (!invite) {
    throw new InviteError('INVITE_080', 'Convite não encontrado.')
  }

  if (invite.status !== InviteStatus.PENDING) {
    throw new InviteError('INVITE_090', 'Apenas convites pendentes podem ser revogados.')
  }

  await inviteService.revoke(id)

  // Audit log
  await AuditService.log({
    userId: admin.id,
    action: 'invite.revoked',
    resource: 'invites',
    resourceId: id,
    metadata: {
      emailPrefix: invite.email.split('@')[0],
    },
    ipAddress: await getClientIp(),
  })

  return { success: true }
}

/**
 * Retorna o histórico de ações relacionadas a convites (resource = 'invites').
 * Máximo de 100 entradas mais recentes.
 */
export async function getAuditLog(): Promise<AuditLogEntry[]> {
  await requireAdmin()

  const logs = await prisma.auditLog.findMany({
    where: { resource: 'invites' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      action: true,
      ipAddress: true,
      createdAt: true,
      user: { select: { email: true } },
    },
  })

  return logs.map(log => ({
    id: log.id,
    action: log.action,
    performedBy: log.user?.email ?? null,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
  }))
}
