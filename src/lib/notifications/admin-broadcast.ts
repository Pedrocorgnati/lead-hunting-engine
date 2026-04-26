/**
 * R-02 intake-review (CL-311): dispatch fire-and-forget para todos admins ativos.
 * Usado para eventos inbound (ex: CONTACT_MESSAGE_RECEIVED) onde o endpoint
 * publico nao tem um userId especifico — a notificacao vai para a equipe.
 */
import { prisma } from '@/lib/prisma'
import { dispatch } from './dispatcher'
import type { NotificationEventKey } from './copy'

export interface BroadcastInput {
  event: NotificationEventKey
  params?: Record<string, unknown>
  data?: Record<string, unknown>
}

/**
 * Lista admins ativos (NAO deactivated) e dispara notificacao in-app + canais
 * habilitados via `dispatch()`. Erros sao logados mas nao propagados:
 * uma landing submission NUNCA falha por causa de notificacao interna.
 */
export async function notifyAdmins(input: BroadcastInput): Promise<{ count: number }> {
  try {
    const admins = await prisma.userProfile.findMany({
      where: { role: 'ADMIN', deactivatedAt: null },
      select: { id: true },
    })
    await Promise.allSettled(
      admins.map((a) =>
        dispatch({
          userId: a.id,
          event: input.event,
          params: input.params,
          data: input.data,
        }),
      ),
    )
    return { count: admins.length }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notifyAdmins] broadcast failed:', err instanceof Error ? err.message : err)
    return { count: 0 }
  }
}
