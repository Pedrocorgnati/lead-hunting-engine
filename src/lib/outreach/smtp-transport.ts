import 'server-only'

/**
 * outreach-engine (brainstorm 06-10): transporte SMTP por caixa (Hostinger
 * ou compativel). Caminho SEPARADO do email transacional (Resend) — cold
 * outbound nunca passa pelo canal de notificacao interna.
 *
 * Import dinamico do nodemailer (padrao graceful-degradation do projeto):
 * sem credencial decryptavel ou falha de conexao => CodedError com
 * reason_code, nunca envio parcial silencioso.
 */
import type { MailboxSmtpConfig } from './mailbox-service'
import { CodedError } from '@/lib/workers/reason-codes'

export interface SendEmailInput {
  to: string
  subject: string
  text: string
  html?: string
  /** Header Message-ID deterministico (idempotencia por replayToken). */
  messageIdSeed?: string
  headers?: Record<string, string>
}

export interface SendEmailResult {
  messageId: string
  smtpResponse: string
  accepted: string[]
  rejected: string[]
}

export async function sendViaSmtp(
  config: MailboxSmtpConfig,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  let nodemailer: typeof import('nodemailer')
  try {
    nodemailer = await import('nodemailer')
  } catch (err) {
    throw new CodedError('nodemailer indisponivel no runtime', {
      reasonCode: 'provider',
      permanent: true,
      cause: err,
    })
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  })

  try {
    const info = await transporter.sendMail({
      from: config.fromName
        ? { name: config.fromName, address: config.fromAddress }
        : config.fromAddress,
      replyTo: config.replyTo ?? undefined,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      messageId: input.messageIdSeed
        ? `<${input.messageIdSeed}@${config.fromAddress.split('@')[1] ?? 'outreach.local'}>`
        : undefined,
      headers: input.headers,
    })
    return {
      messageId: info.messageId ?? '',
      smtpResponse: String(info.response ?? '').slice(0, 1000),
      accepted: (info.accepted ?? []).map(String),
      rejected: (info.rejected ?? []).map(String),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // EAUTH/535 = credencial — permanente para esta caixa (nao re-tentar cego).
    if (/EAUTH|535|invalid login|authentication/i.test(msg)) {
      throw new CodedError(`falha de autenticacao SMTP: ${msg}`, {
        reasonCode: 'auth',
        permanent: true,
        cause: err,
      })
    }
    // 550/551/553 = recusa do destinatario (hard bounce sincrono).
    if (/55[0-9][\s-]/.test(msg) || /mailbox unavailable|user unknown|no such user/i.test(msg)) {
      throw new CodedError(`recusa do destinatario (hard bounce): ${msg}`, {
        reasonCode: 'suppression',
        permanent: true,
        cause: err,
      })
    }
    throw new CodedError(`falha de envio SMTP: ${msg}`, {
      reasonCode: 'network',
      cause: err,
    })
  } finally {
    transporter.close()
  }
}

/** Verificacao de conexao/login da caixa (usada no preflight checklist 31). */
export async function verifySmtpConnection(config: MailboxSmtpConfig): Promise<boolean> {
  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10_000,
    })
    try {
      await transporter.verify()
      return true
    } finally {
      transporter.close()
    }
  } catch {
    return false
  }
}
