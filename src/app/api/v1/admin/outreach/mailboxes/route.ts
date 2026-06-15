/**
 * outreach-engine (brainstorm 06-10): gestao de caixas SMTP/IMAP.
 * Sem esta rota nao havia como cadastrar a primeira caixa pela UI e o motor
 * de envio ficava inerte (pickHealthyMailbox -> null). GET lista (com saude),
 * POST cria (em PAUSED), PATCH ativa/pausa, DELETE remove. Senha cifrada;
 * NUNCA retornada. Mutacoes auditadas.
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { createMailbox, computeMailboxHealth, toSmtpConfig } from '@/lib/outreach/mailbox-service'
import { verifySmtpConnection } from '@/lib/outreach/smtp-transport'
import { AuditService } from '@/lib/services/audit-service'

const CreateSchema = z.object({
  label: z.string().min(2).max(120),
  emailAddress: z.string().email(),
  password: z.string().min(1).max(500),
  smtpHost: z.string().min(3).max(255),
  smtpPort: z.number().int().positive().max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  imapHost: z.string().max(255).optional(),
  imapPort: z.number().int().positive().max(65535).optional(),
  username: z.string().max(255).optional(),
  fromName: z.string().max(255).optional(),
  replyTo: z.string().email().optional(),
  timezone: z.string().max(60).optional(),
  sendWindowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sendWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dailyCap: z.number().int().positive().max(10000).optional(),
  minGapSeconds: z.number().int().min(0).max(86400).optional(),
  jitterSeconds: z.number().int().min(0).max(3600).optional(),
  region: z.string().max(10).optional(),
})

const PatchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['activate', 'pause', 'test']),
})

/** Saneia uma caixa para a UI — NUNCA expoe senha/iv. */
function toView(m: { id: string; label: string; emailAddress: string; status: string; smtpHost: string; smtpPort: number; dailyCap: number; sendWindowStart: string; sendWindowEnd: string; timezone: string; lastSentAt: Date | null; lastError: string | null }) {
  return {
    id: m.id, label: m.label, emailAddress: m.emailAddress, status: m.status,
    smtpHost: m.smtpHost, smtpPort: m.smtpPort, dailyCap: m.dailyCap,
    sendWindow: `${m.sendWindowStart}-${m.sendWindowEnd} (${m.timezone})`,
    lastSentAt: m.lastSentAt, lastError: m.lastError,
  }
}

export async function GET() {
  try {
    await requireAdmin()
    const mailboxes = await prisma.outreachMailbox.findMany({ orderBy: { createdAt: 'desc' } })
    const withHealth = await Promise.all(
      mailboxes.map(async (m) => ({ ...toView(m), health: await computeMailboxHealth(m) })),
    )
    return successResponse({ mailboxes: withHealth })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return handleApiError(parsed.error)
    const result = await createMailbox(parsed.data)
    await AuditService.log({
      userId: admin.id,
      action: 'outreach.mailbox_created',
      resource: 'outreach_mailbox',
      resourceId: result.id,
      metadata: { label: parsed.data.label, emailAddress: parsed.data.emailAddress },
    })
    return successResponse(result, 201)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return handleApiError(parsed.error)
    const { id, action } = parsed.data

    if (action === 'test') {
      const mailbox = await prisma.outreachMailbox.findUnique({ where: { id } })
      if (!mailbox) return handleApiError(Object.assign(new Error('caixa nao encontrada'), { code: 'NOT_FOUND', httpStatus: 404 }))
      const config = toSmtpConfig(mailbox)
      if (!config) return successResponse({ ok: false, reason: 'credencial SMTP ausente ou nao-decryptavel' })
      const ok = await verifySmtpConnection(config)
      return successResponse({ ok, reason: ok ? 'conexao SMTP verificada' : 'falha ao conectar/autenticar' })
    }

    const status = action === 'activate' ? 'ACTIVE' : 'PAUSED'
    await prisma.outreachMailbox.update({ where: { id }, data: { status } })
    await AuditService.log({
      userId: admin.id,
      action: 'outreach.mailbox_status_changed',
      resource: 'outreach_mailbox',
      resourceId: id,
      metadata: { status },
    })
    return successResponse({ id, status })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return handleApiError(Object.assign(new Error('id obrigatorio'), { code: 'VALIDATION', httpStatus: 400 }))
    await prisma.outreachMailbox.deleteMany({ where: { id } })
    await AuditService.log({
      userId: admin.id,
      action: 'outreach.mailbox_status_changed',
      resource: 'outreach_mailbox',
      resourceId: id,
      metadata: { status: 'DELETED' },
    })
    return successResponse({ deleted: true })
  } catch (error) {
    return handleApiError(error)
  }
}
