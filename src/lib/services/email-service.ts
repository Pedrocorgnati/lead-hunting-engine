/**
 * EmailService — Integração Resend (opcional)
 * Se RESEND_API_KEY não estiver configurada, Supabase Auth nativo é usado.
 * Referência: TASK-4/ST002, NOTIFICATION-SPEC NOTIF-001
 */
export class EmailService {
  /**
   * Envia email de convite via Resend.
   * Se RESEND_API_KEY ausente → retorna silenciosamente (Supabase Auth nativo já enviou).
   * Se NEXT_PUBLIC_APP_URL ausente → lança erro explícito.
   */
  static async sendInvite(to: string, inviteUrl: string): Promise<void> {
    if (!process.env.RESEND_API_KEY) {
      // Fallback: Supabase Auth nativo já enviou o email via inviteUserByEmail()
      return
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      throw new Error('NEXT_PUBLIC_APP_URL não configurado — necessário para emails de convite')
    }

    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)

      await resend.emails.send({
        from: 'Lead Hunting Engine <noreply@leadhuntingengine.com.br>',
        to,
        subject: 'Você foi convidado para o Lead Hunting Engine',
        html: `
          <!DOCTYPE html>
          <html lang="pt-BR">
          <body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="color:#1e293b;">Bem-vindo ao Lead Hunting Engine!</h2>
            <p style="color:#64748b;">
              Você foi convidado para acessar a plataforma de prospecção automatizada de leads qualificados.
            </p>
            <p style="margin:24px 0;">
              <a href="${inviteUrl}"
                 style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;
                        text-decoration:none;border-radius:6px;font-weight:600;">
                Ativar minha conta
              </a>
            </p>
            <p style="color:#94a3b8;font-size:12px;">
              Este link expira em 7 dias. Se você não esperava este convite, ignore este email.
            </p>
            <p style="color:#94a3b8;font-size:12px;margin-top:16px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/termos" style="color:#94a3b8;">Termos de Uso</a> ·
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/privacidade" style="color:#94a3b8;">Privacidade</a>
            </p>
          </body>
          </html>
        `,
      })
    } catch (error) {
      // Falha no Resend não bloqueia o fluxo — Supabase Auth já enviou o email nativo
      console.error('[EmailService] Resend sendInvite failed:', error)
    }
  }

  /**
   * Envia email de reset de senha via Resend.
   * Se RESEND_API_KEY ausente → retorna silenciosamente (Supabase Auth nativo já enviou).
   */
  static async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    if (!process.env.RESEND_API_KEY) {
      return // Supabase Auth nativo
    }

    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)

      await resend.emails.send({
        from: 'Lead Hunting Engine <noreply@leadhuntingengine.com.br>',
        to,
        subject: 'Redefinição de senha — Lead Hunting Engine',
        html: `
          <!DOCTYPE html>
          <html lang="pt-BR">
          <body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="color:#1e293b;">Redefinição de senha</h2>
            <p style="color:#64748b;">
              Recebemos uma solicitação para redefinir sua senha.
            </p>
            <p style="margin:24px 0;">
              <a href="${resetUrl}"
                 style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;
                        text-decoration:none;border-radius:6px;font-weight:600;">
                Redefinir minha senha
              </a>
            </p>
            <p style="color:#94a3b8;font-size:12px;">
              Este link expira em 1 hora. Se você não solicitou a redefinição, ignore este email.
            </p>
          </body>
          </html>
        `,
      })
    } catch (error) {
      console.error('[EmailService] Resend sendPasswordReset failed:', error)
    }
  }
}
