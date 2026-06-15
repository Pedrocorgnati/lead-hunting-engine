import 'server-only'

/**
 * outreach-engine (brainstorm 06-10): gestao de caixas SMTP/IMAP.
 *
 * - Senha cifrada AES-256-GCM no formato packed "ciphertext:authTag" + iv
 *   em coluna propria (mesmo padrao de ApiCredential/CryptoUtil).
 * - Saude da caixa (task 14/F-14): bounce-rate da janela de 24h sobre os
 *   dispatches; acima do limiar => UNHEALTHY (nenhum envio sai de caixa
 *   unhealthy — criterio de falha 5 da Fase 1 do fonte).
 * - Caps: dailyCap por caixa contado em banco (rate limiters in-memory nao
 *   servem para cap diario; gotcha mapeado).
 */
import { prisma } from '@/lib/prisma'
import { CryptoUtil, unpackEncrypted } from '@/lib/services/crypto-util'
import type { OutreachMailbox } from '@prisma/client'
import { getOutreachThresholds } from '@/lib/services/system-config'

export interface MailboxSmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromName: string | null
  fromAddress: string
  replyTo: string | null
}

export function encryptMailboxPassword(plaintext: string): {
  encryptedPassword: string
  passwordIv: string
} {
  const { encryptedKey, iv, authTag } = CryptoUtil.encrypt(plaintext)
  return { encryptedPassword: `${encryptedKey}:${authTag}`, passwordIv: iv }
}

export function decryptMailboxPassword(mailbox: {
  encryptedPassword: string | null
  passwordIv: string | null
}): string | null {
  if (!mailbox.encryptedPassword || !mailbox.passwordIv) return null
  try {
    const { encryptedKey, authTag } = unpackEncrypted(mailbox.encryptedPassword)
    return CryptoUtil.decrypt(encryptedKey, mailbox.passwordIv, authTag)
  } catch {
    // Falha de decrypt nunca loga plaintext nem detalhes da chave.
    return null
  }
}

export function toSmtpConfig(mailbox: OutreachMailbox): MailboxSmtpConfig | null {
  const pass = decryptMailboxPassword(mailbox)
  if (!pass) return null
  return {
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpSecure,
    user: mailbox.username,
    pass,
    fromName: mailbox.fromName,
    fromAddress: mailbox.emailAddress,
    replyTo: mailbox.replyTo,
  }
}

export interface MailboxHealth {
  mailboxId: string
  status: 'ACTIVE' | 'PAUSED' | 'UNHEALTHY'
  healthy: boolean
  sent24h: number
  bounced24h: number
  bounceRate24h: number
  dailyCapRemaining: number
  reasons: string[]
}

/**
 * Saude derivada on-read (padrao computeProviderHealth): status persistido +
 * bounce-rate 24h + cap diario. `healthy=false` bloqueia envio no preflight.
 */
export async function computeMailboxHealth(
  mailbox: OutreachMailbox,
  now: Date = new Date(),
): Promise<MailboxHealth> {
  const thresholds = await getOutreachThresholds()
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const reasons: string[] = []

  const [sent24h, bounced24h] = await Promise.all([
    prisma.outreachDispatch.count({
      where: { mailboxId: mailbox.id, sentAt: { gte: since }, dryRun: false },
    }),
    prisma.outreachDispatch.count({
      where: {
        mailboxId: mailbox.id,
        reasonCode: 'suppression',
        replyOutcome: 'BOUNCED',
        updatedAt: { gte: since },
      },
    }),
  ])

  // BOUNCED tambem chega via replyOutcome de dispatches SENT — consulta acima
  // cobre o caminho marcado; soma os FAILED com bounce explicito:
  const bouncedFailed = await prisma.outreachDispatch.count({
    where: {
      mailboxId: mailbox.id,
      status: { in: ['FAILED', 'FAILED_PERMANENT'] },
      failReason: { contains: 'bounce', mode: 'insensitive' },
      updatedAt: { gte: since },
    },
  })
  const totalBounced = bounced24h + bouncedFailed
  const denominator = sent24h + totalBounced
  const bounceRate =
    denominator >= thresholds.minSampleForBounceRate ? totalBounced / denominator : 0

  if (mailbox.status === 'PAUSED') reasons.push('caixa pausada')
  if (mailbox.status === 'UNHEALTHY') reasons.push('caixa marcada unhealthy')
  if (bounceRate > thresholds.maxBounceRate) {
    reasons.push(
      `bounce-rate 24h ${(bounceRate * 100).toFixed(1)}% acima do limiar ${(thresholds.maxBounceRate * 100).toFixed(1)}%`,
    )
  }
  const dailyCapRemaining = Math.max(0, mailbox.dailyCap - sent24h)
  if (dailyCapRemaining === 0) reasons.push('cap diario atingido')

  const healthy = mailbox.status === 'ACTIVE' && bounceRate <= thresholds.maxBounceRate && dailyCapRemaining > 0

  return {
    mailboxId: mailbox.id,
    status: mailbox.status,
    healthy,
    sent24h,
    bounced24h: totalBounced,
    bounceRate24h: bounceRate,
    dailyCapRemaining,
    reasons,
  }
}

/** Marca caixa UNHEALTHY com motivo (auto-protecao reputacional, F-14). */
export async function markMailboxUnhealthy(mailboxId: string, reason: string): Promise<void> {
  await prisma.outreachMailbox.update({
    where: { id: mailboxId },
    data: { status: 'UNHEALTHY', lastError: reason.slice(0, 1000) },
  })
}

export interface CreateMailboxInput {
  label: string
  emailAddress: string
  password: string
  smtpHost: string
  smtpPort?: number
  smtpSecure?: boolean
  imapHost?: string
  imapPort?: number
  username?: string
  fromName?: string
  replyTo?: string
  timezone?: string
  sendWindowStart?: string
  sendWindowEnd?: string
  dailyCap?: number
  minGapSeconds?: number
  jitterSeconds?: number
  region?: string
}

/** Cria caixa em estado PAUSED (ativacao e acao explicita do operador). */
export async function createMailbox(input: CreateMailboxInput): Promise<{ id: string }> {
  const { encryptedPassword, passwordIv } = encryptMailboxPassword(input.password)
  const row = await prisma.outreachMailbox.create({
    data: {
      label: input.label,
      emailAddress: input.emailAddress.trim().toLowerCase(),
      username: input.username ?? input.emailAddress.trim().toLowerCase(),
      encryptedPassword,
      passwordIv,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort ?? 465,
      smtpSecure: input.smtpSecure ?? true,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      fromName: input.fromName,
      replyTo: input.replyTo,
      timezone: input.timezone ?? 'America/Sao_Paulo',
      sendWindowStart: input.sendWindowStart ?? '09:00',
      sendWindowEnd: input.sendWindowEnd ?? '18:00',
      dailyCap: input.dailyCap ?? 50,
      minGapSeconds: input.minGapSeconds ?? 90,
      jitterSeconds: input.jitterSeconds ?? 60,
      region: input.region,
      status: 'PAUSED',
    },
    select: { id: true },
  })
  return { id: row.id }
}

/** Seleciona caixa ACTIVE saudavel com cap disponivel (round-robin por lastSentAt). */
export async function pickHealthyMailbox(now: Date = new Date()): Promise<OutreachMailbox | null> {
  const candidates = await prisma.outreachMailbox.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { lastSentAt: { sort: 'asc', nulls: 'first' } },
  })
  for (const mailbox of candidates) {
    const health = await computeMailboxHealth(mailbox, now)
    if (health.healthy) return mailbox
  }
  return null
}
