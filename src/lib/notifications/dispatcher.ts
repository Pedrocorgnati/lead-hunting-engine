import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { copyFor, type NotificationEventKey, type CopyParams } from './copy'
import { emailChannel } from './channels/email-channel'
import { webPushChannel } from './channels/web-push-channel'

/**
 * Notifications Dispatcher
 * ========================
 *
 * Central de disparo de notificacoes.
 * Canais suportados (fallback chain):
 *   1. push   — browser Notification API (acionado pelo client ao detectar nova row)
 *   2. email  — via Resend (stub se RESEND_API_KEY ausente)
 *   3. in-app — row em `notifications` (sempre criada como fallback final)
 *
 * Regra inviolavel (Zero Silencio): uma notificacao in-app SEMPRE e criada,
 * mesmo que todos os canais externos falhem. Assim o usuario pode recuperar
 * o historico na central `/notifications`.
 *
 * Eventos suportados — ver `copy.ts#NotificationEventKey`.
 *
 * Extensoes em relacao ao dispatcher v1 (TASK-11):
 *   - Mapa de copy centralizado (`copyFor`)
 *   - Consulta `NotificationPreference` por (userId, event) antes de enviar
 *   - Fallback push -> email -> in-app com try/catch em cadeia
 *   - Helper `dispatchLeadHot` preservado
 */

export type NotificationEvent = NotificationEventKey

export type NotificationChannel = 'push' | 'email' | 'in-app'

export const ALL_CHANNELS: NotificationChannel[] = ['push', 'email', 'in-app']
export const DEFAULT_CHANNELS: NotificationChannel[] = ['push', 'email', 'in-app']

export interface DispatchPayload {
  event: NotificationEvent
  userId: string
  /** Parametros repassados para `copyFor(event, params)`. */
  params?: CopyParams
  /**
   * Override opcional de copy. Se omitido, usa `copyFor(event, params)`.
   * Mantido para compat com chamadas legadas que passavam `title`/`message`.
   */
  title?: string
  message?: string
  data?: Record<string, unknown>
}

interface ChannelSendResult {
  channel: NotificationChannel
  ok: boolean
  error?: string
}

/**
 * Consulta preferencias do usuario para o evento.
 * Ausencia de row => DEFAULT_CHANNELS.
 */
async function resolveChannels(
  userId: string,
  event: NotificationEvent
): Promise<NotificationChannel[]> {
  try {
    // `notificationPreference` pode nao estar gerada no client ate
    // `prisma generate` rodar — guardamos com try/catch.
    const pref = await (prisma as unknown as {
      notificationPreference: {
        findUnique: (args: { where: { userId_event: { userId: string; event: string } } }) =>
          Promise<{ channels: string[] } | null>
      }
    }).notificationPreference
      .findUnique({ where: { userId_event: { userId, event } } })
      .catch(() => null)

    if (!pref) return DEFAULT_CHANNELS
    const filtered = pref.channels.filter((c): c is NotificationChannel =>
      ALL_CHANNELS.includes(c as NotificationChannel)
    )
    return filtered.length > 0 ? filtered : DEFAULT_CHANNELS
  } catch {
    return DEFAULT_CHANNELS
  }
}

/**
 * Push channel — agora delega para web-push-channel.ts (VAPID).
 * Retorna true se pelo menos uma subscription recebeu o payload;
 * false em qualquer caso de fallback (sem VAPID, sem sub, sem package).
 */
async function sendPush(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  return webPushChannel.send({ userId, title, body, data }).catch(() => false)
}

/**
 * Email channel — agora delega para email-channel.ts (Resend).
 */
async function sendEmail(userId: string, title: string, body: string): Promise<boolean> {
  return emailChannel.send({ userId, title, body }).catch(() => false)
}

/**
 * Cria row in-app. Ultimo elo da fallback chain — nunca deve ser pulado
 * exceto se o usuario desativar explicitamente o canal `in-app` nas
 * preferencias (mesmo assim, se push E email falharam, forcamos in-app
 * para nao sumir a informacao).
 */
async function sendInApp(
  userId: string,
  event: NotificationEvent,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type: event,
        title,
        message: body,
        data: data as Prisma.InputJsonValue,
      },
    })
    return true
  } catch (e) {
    console.warn('[notifications] in-app falhou:', (e as Error).message)
    return false
  }
}

/**
 * Persiste a notificacao e aciona canais habilitados com fallback chain.
 * Tolerante a falha — erros sao logados mas nao propagam para nao
 * bloquear o fluxo principal (ex: criacao de lead).
 *
 * Ordem: push -> email -> in-app. Canais desabilitados pela preferencia
 * sao pulados; mas se push e email falharam/foram pulados, forcamos
 * in-app para garantir Zero Silencio.
 */
export async function dispatch(payload: DispatchPayload): Promise<void> {
  try {
    const copy = payload.title && payload.message
      ? { title: payload.title, body: payload.message }
      : copyFor(payload.event, payload.params ?? {})

    const enabled = await resolveChannels(payload.userId, payload.event)
    const data = payload.data ?? {}
    const results: ChannelSendResult[] = []

    let deliveredExternal = false

    if (enabled.includes('push')) {
      const ok = await sendPush(payload.userId, copy.title, copy.body, data).catch(() => false)
      results.push({ channel: 'push', ok })
      if (ok) deliveredExternal = true
    }

    if (enabled.includes('email')) {
      const ok = await sendEmail(payload.userId, copy.title, copy.body).catch(() => false)
      results.push({ channel: 'email', ok })
      if (ok) deliveredExternal = true
    }

    // In-app: sempre cria se habilitado OU se todos os externos falharam
    // (Zero Silencio). Unica forma de pular: user desabilitou in-app E
    // pelo menos um canal externo entregou.
    const shouldCreateInApp = enabled.includes('in-app') || !deliveredExternal
    if (shouldCreateInApp) {
      const ok = await sendInApp(
        payload.userId,
        payload.event,
        copy.title,
        copy.body,
        data
      )
      results.push({ channel: 'in-app', ok })
    }

    const delivered = results.filter((r) => r.ok).map((r) => r.channel).join(',')
    console.info(
      `[notifications] ${payload.event} -> user=${payload.userId} delivered=[${delivered}]`
    )
  } catch (e) {
    console.warn('[notifications] falha ao despachar:', (e as Error).message)
  }
}

/**
 * Helper especifico para LEAD_HOT — disparado quando score > 80.
 * Preservado da v1 (TASK-11). Usa copyFor internamente.
 */
export async function dispatchLeadHot(
  userId: string,
  lead: {
    id: string
    businessName: string
    score: number
    city: string | null
  }
): Promise<void> {
  const HOT_THRESHOLD = 80
  if (lead.score <= HOT_THRESHOLD) return

  await dispatch({
    event: 'LEAD_HOT',
    userId,
    params: {
      businessName: lead.businessName,
      score: lead.score,
      city: lead.city,
      leadId: lead.id,
    },
    data: { leadId: lead.id, score: lead.score },
  })
}

// Export namespace para testes (jest.spyOn(dispatcher, 'dispatch'))
export const dispatcher = { dispatch, dispatchLeadHot }
