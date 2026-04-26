import { prisma } from '@/lib/prisma'

/**
 * Web Push channel (TASK-7 / CL-138).
 *
 * Envia push real via web-push (VAPID) para todas as subscriptions
 * do usuario. Quando o pacote `web-push` nao esta instalado OU
 * faltam VAPID keys, retorna false para fallback.
 *
 * Persistencia: tabela `PushSubscription` (prisma).
 * Endpoint de registro: POST /api/v1/push/subscribe.
 *
 * Nota: dynamic import `web-push` e tolerante a package ausente —
 * deploy inicial sem a dep ainda retorna false (fallback email/in-app).
 * Rodar `npm i web-push @types/web-push` para ativar o canal real.
 */

export interface WebPushSendInput {
  userId: string
  title: string
  body: string
  data?: Record<string, unknown>
}

interface PushSubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface WebPushModule {
  setVapidDetails: (email: string, pub: string, priv: string) => void
  sendNotification: (sub: unknown, payload: string) => Promise<unknown>
}

async function loadWebPush(): Promise<WebPushModule | null> {
  try {
    // Indireto para evitar que o TS exija @types/web-push em build.
    // O pacote e opcional — `npm i web-push` ativa o canal.
    const modName = 'web-push'
    const mod = (await import(/* webpackIgnore: true */ modName).catch(() => null)) as
      | { default?: WebPushModule }
      | WebPushModule
      | null
    if (!mod) return null
    const resolved = (mod as { default?: WebPushModule }).default ?? (mod as WebPushModule)
    if (typeof resolved?.setVapidDetails !== 'function') return null
    return resolved
  } catch {
    return null
  }
}

async function fetchSubscriptions(userId: string): Promise<PushSubscriptionRow[]> {
  const client = prisma as unknown as {
    pushSubscription?: {
      findMany: (args: { where: { userId: string } }) => Promise<PushSubscriptionRow[]>
    }
  }
  if (!client.pushSubscription) return []
  try {
    return await client.pushSubscription.findMany({ where: { userId } })
  } catch {
    return []
  }
}

async function deleteSubscription(id: string): Promise<void> {
  const client = prisma as unknown as {
    pushSubscription?: { delete: (args: { where: { id: string } }) => Promise<unknown> }
  }
  try {
    await client.pushSubscription?.delete({ where: { id } })
  } catch {
    // silencioso
  }
}

export async function sendWebPush({ userId, title, body, data }: WebPushSendInput): Promise<boolean> {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) {
    console.info(`[notifications.push] stub (sem VAPID keys): user=${userId}`)
    return false
  }
  const subs = await fetchSubscriptions(userId)
  if (subs.length === 0) {
    return false
  }
  const webPush = await loadWebPush()
  if (!webPush) {
    console.info('[notifications.push] stub (pacote web-push nao instalado)')
    return false
  }
  webPush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL || 'suporte@leadhuntingengine.com.br'}`,
    pub,
    priv,
  )
  const payload = JSON.stringify({ title, body, data: data ?? {} })
  let delivered = 0
  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      delivered += 1
    } catch (e) {
      const err = e as { statusCode?: number }
      // 404/410 indicam subscription expirada — remover
      if (err.statusCode === 404 || err.statusCode === 410) {
        await deleteSubscription(sub.id)
      } else {
        console.warn('[notifications.push] falha:', (e as Error).message)
      }
    }
  }
  return delivered > 0
}

export const webPushChannel = { send: sendWebPush }
