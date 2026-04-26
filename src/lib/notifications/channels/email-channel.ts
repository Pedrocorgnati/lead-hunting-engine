import { prisma } from '@/lib/prisma'

/**
 * Email channel (TASK-7 / CL-138).
 *
 * Envia email transacional via Resend. Se `RESEND_API_KEY` ausente,
 * retorna false (fallback) para nao quebrar a chain.
 *
 * Eventos elegiveis (definidos pelo dispatcher):
 *   - COLLECTION_BLOCKED
 *   - COLLECTION_COMPLETED_LARGE
 *   - CREDENTIAL_EXPIRED
 *   - LEAD_HOT (opcional, respeita preferencia)
 *
 * De (from): RESEND_FROM_EMAIL ou default.
 * Reply-To: RESEND_REPLY_TO_EMAIL ou default.
 */

export interface EmailSendInput {
  userId: string
  title: string
  body: string
}

const DEFAULT_FROM = 'Lead Hunting Engine <noreply@leadhuntingengine.com.br>'
const DEFAULT_REPLY_TO = 'suporte@leadhuntingengine.com.br'

function renderHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b;">
  <h2 style="margin:0 0 12px 0;">${title}</h2>
  <p style="color:#64748b;line-height:1.5;">${body}</p>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
    Lead Hunting Engine — voce pode ajustar seus canais em Configuracoes &rsaquo; Notificacoes.
  </p>
</body>
</html>`
}

function renderText(title: string, body: string): string {
  return `${title}\n\n${body}\n\n— Lead Hunting Engine`
}

export async function sendEmail({ userId, title, body }: EmailSendInput): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.info(`[notifications.email] stub (sem RESEND_API_KEY): user=${userId} "${title}"`)
    return false
  }
  try {
    const user = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    })
    if (!user?.email) return false

    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
      to: user.email,
      replyTo: process.env.RESEND_REPLY_TO_EMAIL || DEFAULT_REPLY_TO,
      subject: title,
      html: renderHtml(title, body),
      text: renderText(title, body),
    })
    return true
  } catch (e) {
    console.warn('[notifications.email] falhou:', (e as Error).message)
    return false
  }
}

export const emailChannel = { send: sendEmail }
