/**
 * scripts/seed-outreach-mailbox.ts
 *
 * Cadastra uma Caixa de Outreach (SMTP/IMAP) direto no banco, no MESMO formato
 * que a UI Admin -> Outreach -> Caixas usa (senha AES-256-GCM via ENCRYPTION_KEY,
 * packed "ciphertext:authTag" + iv -- identico a encryptMailboxPassword()).
 * Depois testa a conexao SMTP (nodemailer.verify) e, se passar, ATIVA a caixa.
 * Idempotente por emailAddress (atualiza credencial/SMTP se ja existir).
 *
 * NAO importa src/lib/prisma nem mailbox-service/smtp-transport: esses puxam
 * 'server-only' e quebram fora do runtime Next. Usa o seed client + CryptoUtil
 * (apenas node:crypto) + nodemailer direto.
 *
 * A senha NUNCA aparece em argv nem em log: e lida de process.env e mascarada.
 *
 * Uso:
 *   MB_EMAIL="contato@corgnati.com" MB_PASSWORD="<senha-da-conta>" \
 *   pnpm tsx scripts/seed-outreach-mailbox.ts
 *
 * Variaveis (defaults entre []):
 *   MB_EMAIL        (obrigatorio)  endereco da conta de email
 *   MB_PASSWORD     (obrigatorio)  senha DA CONTA DE EMAIL (nao SSH, nao Resend)
 *   MB_LABEL        [Corgnati principal]
 *   MB_SMTP_HOST    [smtp.hostinger.com]   MB_SMTP_PORT [465]
 *   MB_IMAP_HOST    [imap.hostinger.com]   MB_IMAP_PORT [993]
 *   MB_FROM_NAME    [Pedro / Corgnati]     MB_REPLY_TO  [= MB_EMAIL]
 *   MB_DAILY_CAP    [30]
 *   MB_WINDOW_START [09:00]                MB_WINDOW_END [18:00]
 *   MB_NO_ACTIVATE  [unset]  se "1", cria PAUSED e nao testa/ativa
 *
 * Pre-req: ENCRYPTION_KEY (64 hex) e DATABASE_URL no .env.
 */
import 'dotenv/config'
import { CryptoUtil } from '../src/lib/services/crypto-util'
import { createSeedClient } from '../prisma/seed/client'

function mask(v: string): string {
  if (v.length <= 4) return '****'
  return `${v.slice(0, 2)}***${v.slice(-2)}`
}

async function main() {
  const email = process.env.MB_EMAIL?.trim().toLowerCase()
  const password = process.env.MB_PASSWORD
  if (!email) throw new Error('MB_EMAIL ausente (ex: contato@corgnati.com)')
  if (!password) throw new Error('MB_PASSWORD ausente (senha DA CONTA DE EMAIL)')
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
    throw new Error('ENCRYPTION_KEY invalida no .env (precisa 64 hex)')
  }

  const smtpHost = process.env.MB_SMTP_HOST ?? 'smtp.hostinger.com'
  const smtpPort = Number(process.env.MB_SMTP_PORT ?? '465')
  const smtpSecure = true

  // Mesma cifra/packing de encryptMailboxPassword() do mailbox-service.
  const { encryptedKey, iv, authTag } = CryptoUtil.encrypt(password)
  const encryptedPassword = `${encryptedKey}:${authTag}`
  const passwordIv = iv

  const common = {
    label: process.env.MB_LABEL ?? 'Corgnati principal',
    emailAddress: email,
    username: email,
    encryptedPassword,
    passwordIv,
    smtpHost,
    smtpPort,
    smtpSecure,
    imapHost: process.env.MB_IMAP_HOST ?? 'imap.hostinger.com',
    imapPort: Number(process.env.MB_IMAP_PORT ?? '993'),
    fromName: process.env.MB_FROM_NAME ?? 'Pedro / Corgnati',
    replyTo: process.env.MB_REPLY_TO ?? email,
    timezone: 'America/Sao_Paulo',
    sendWindowStart: process.env.MB_WINDOW_START ?? '09:00',
    sendWindowEnd: process.env.MB_WINDOW_END ?? '18:00',
    dailyCap: Number(process.env.MB_DAILY_CAP ?? '30'),
    minGapSeconds: 90,
    jitterSeconds: 60,
  }

  const prisma = createSeedClient()
  try {
    const existing = await prisma.outreachMailbox.findFirst({ where: { emailAddress: email } })
    let id: string
    if (existing) {
      await prisma.outreachMailbox.update({ where: { id: existing.id }, data: common })
      id = existing.id
      console.log(`[mailbox] atualizada id=${id} (${email}, senha ${mask(password)})`)
    } else {
      const row = await prisma.outreachMailbox.create({
        data: { ...common, status: 'PAUSED' },
        select: { id: true },
      })
      id = row.id
      console.log(`[mailbox] criada id=${id} (${email}, senha ${mask(password)}) status=PAUSED`)
    }

    if (process.env.MB_NO_ACTIVATE === '1') {
      console.log('[mailbox] MB_NO_ACTIVATE=1 -> deixando PAUSED, sem testar SMTP.')
      return
    }

    // Teste de conexao SMTP real (mesma config do envio) antes de ativar.
    const { default: nodemailer } = await import('nodemailer')
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: email, pass: password },
    })

    process.stdout.write(`[mailbox] testando SMTP ${smtpHost}:${smtpPort} ... `)
    let ok = false
    try {
      await transport.verify()
      ok = true
    } catch (err) {
      console.log('FALHOU')
      console.error('[mailbox] erro SMTP:', err instanceof Error ? err.message : String(err))
    }

    if (ok) {
      await prisma.outreachMailbox.update({ where: { id }, data: { status: 'ACTIVE' } })
      console.log('OK -> caixa ATIVADA (status=ACTIVE). Pronta para envio.')
    } else {
      console.log('NAO conectou -> caixa permanece PAUSED. Revise host/porta/senha.')
      process.exitCode = 1
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[mailbox] erro:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
