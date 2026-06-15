/**
 * POST /api/v1/admin/outreach/test-send
 *
 * Envia UM e-mail REAL pro proprio endereco do operador (sessao), via a caixa
 * ativa e saudavel, usando o assunto/corpo de uma campanha (se informada) ou um
 * texto padrao. Serve para o operador VER o envio funcionando ponta a ponta sem
 * precisar de lead com e-mail (o ICP do produto raramente tem e-mail).
 *
 * Decisoes (review adversarial Codex 06-11):
 *  - NAO cria Lead nem OutreachDispatch: teste != outreach real, nao polui
 *    funil/metricas/supressao. MAS e um evento AUDITAVEL proprio
 *    (telemetry outreach.test_send) — rastreabilidade sem contaminar o pipeline.
 *  - RESPEITA o kill-switch global: se os envios estao pausados, o teste tambem
 *    e bloqueado (mesma postura de seguranca do envio real).
 *  - Throttle anti-duplo-clique: 15s entre testes (evita 5 e-mails por engano).
 *  - Destinatario e SEMPRE o e-mail da sessao — nunca um campo do cliente.
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { getOutreachKillSwitch, getConfig, setConfig } from '@/lib/services/system-config'
import { pickHealthyMailbox, toSmtpConfig } from '@/lib/outreach/mailbox-service'
import { sendViaSmtp } from '@/lib/outreach/smtp-transport'
import { track, makeCorrelationId } from '@/lib/telemetry'

const BodySchema = z.object({
  campaignId: z.string().uuid().optional(),
})

const THROTTLE_KEY = 'outreach.test_send_throttle'
const THROTTLE_MS = 15_000

const DEFAULT_SUBJECT = 'Teste de envio — Lead Hunting Engine'
const DEFAULT_BODY =
  'Este é um e-mail de teste enviado pelo Centro de Outreach do Lead Hunting Engine.\n\n' +
  'Se você está lendo isto, a caixa de envio (SMTP) está funcionando ponta a ponta. ' +
  'Nenhum lead foi contatado e nenhuma métrica de campanha foi afetada por este teste.'

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const parsed = BodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return handleApiError(parsed.error)

    // 1. Kill-switch global: enabled=false = estado seguro (zero envio). O teste
    //    nao fura essa trava.
    const killSwitch = await getOutreachKillSwitch()
    if (!killSwitch.enabled) {
      return handleApiError(
        Object.assign(new Error('Os envios estão pausados. Clique em "Reativar envios" antes de enviar um teste.'), {
          code: 'OUTREACH_PAUSED',
          httpStatus: 409,
        }),
      )
    }

    // 2. Throttle anti-duplo-clique (15s).
    const throttle = await getConfig<{ lastAt?: string }>(THROTTLE_KEY)
    if (throttle.lastAt) {
      const elapsed = Date.now() - new Date(throttle.lastAt).getTime()
      if (elapsed >= 0 && elapsed < THROTTLE_MS) {
        return handleApiError(
          Object.assign(new Error('Aguarde alguns segundos antes de enviar outro teste.'), {
            code: 'RATE_LIMITED',
            httpStatus: 429,
          }),
        )
      }
    }

    // 3. Caixa ativa e saudavel (mesma selecao do envio real).
    const mailbox = await pickHealthyMailbox()
    if (!mailbox) {
      return handleApiError(
        Object.assign(new Error('Nenhuma caixa de envio ativa e saudável. Cadastre/ative uma caixa na aba "Caixas".'), {
          code: 'OUTREACH_NO_MAILBOX',
          httpStatus: 409,
        }),
      )
    }
    const smtpConfig = toSmtpConfig(mailbox)
    if (!smtpConfig) {
      return handleApiError(
        Object.assign(new Error('A caixa ativa está sem credencial válida — reabra a caixa e teste a conexão.'), {
          code: 'OUTREACH_MAILBOX_NO_CREDENTIAL',
          httpStatus: 409,
        }),
      )
    }

    // 4. Conteudo: da campanha (1a variante) ou padrao.
    let subject = DEFAULT_SUBJECT
    let body = DEFAULT_BODY
    if (parsed.data.campaignId) {
      const campaign = await prisma.outreachCampaign.findFirst({
        where: { id: parsed.data.campaignId, userId: admin.id },
        select: { name: true, abConfig: true },
      })
      const variant = (campaign?.abConfig as { variants?: Array<{ subject?: string; body?: string }> } | null)
        ?.variants?.[0]
      if (variant?.subject) subject = `[TESTE] ${variant.subject}`
      if (variant?.body) body = variant.body
      else if (campaign) body = `${DEFAULT_BODY}\n\n(Campanha: ${campaign.name})`
    }

    // 5. Envio real para o proprio operador.
    const result = await sendViaSmtp(smtpConfig, {
      to: admin.email,
      subject,
      text: body,
      html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
      messageIdSeed: `test-${makeCorrelationId('test-send')}`,
      headers: { 'X-LHE-Test-Send': '1' },
    })

    await setConfig(THROTTLE_KEY, { lastAt: new Date().toISOString() }, admin.id).catch(() => undefined)
    await track({
      kind: 'outreach.test_send',
      correlationId: makeCorrelationId('test-send'),
      userId: admin.id,
      resourceType: 'outreach_mailbox',
      resourceId: mailbox.id,
      route: '/admin/outreach',
      metadata: {
        to: admin.email,
        mailbox: mailbox.emailAddress,
        campaignId: parsed.data.campaignId ?? null,
        accepted: result.accepted.length,
        rejected: result.rejected.length,
      },
    }).catch(() => undefined)

    return successResponse({
      sent: result.accepted.length > 0 && result.rejected.length === 0,
      to: admin.email,
      mailbox: mailbox.emailAddress,
      smtpResponse: result.smtpResponse,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
