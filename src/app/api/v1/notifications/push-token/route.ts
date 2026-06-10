import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * Push tokens por dispositivo (item 072 / C15).
 *
 * POST   — registra (upsert) o token em device_push_tokens. A versao anterior
 *          era registro de FACHADA: gravava so um audit log e DESCARTAVA o
 *          token. Agora a linha persiste e e consultavel.
 * DELETE — revoga todos os tokens ativos do usuario (revokedAt).
 * GET    — lista tokens ativos do usuario (token mascarado).
 *
 * Web push real (endpoint+VAPID) continua em /api/v1/push/subscribe; esta
 * rota cobre tokens FCM-style de apps nativos/futuros.
 */
const TokenSchema = z.object({
  token: z.string().trim().min(1).max(512),
  platform: z.enum(['web', 'android', 'ios']).optional().default('web'),
})

function maskToken(token: string): string {
  if (token.length <= 14) return `${token.slice(0, 4)}***`
  return `${token.slice(0, 10)}***${token.slice(-4)}`
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = TokenSchema.parse(await request.json())
    const correlationId = crypto.randomUUID()

    const row = await prisma.devicePushToken.upsert({
      where: { token: body.token },
      create: { userId: user.id, token: body.token, platform: body.platform },
      update: { userId: user.id, platform: body.platform, revokedAt: null },
    })

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'push_token.registered',
        resource: 'notification',
        resourceId: row.id,
        metadata: { platform: body.platform, correlationId, token: maskToken(body.token) },
      },
    })

    return successResponse({ registered: true, id: row.id, correlationId, platform: body.platform })
  } catch (error) { return handleApiError(error) }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth()
    const correlationId = crypto.randomUUID()

    const revoked = await prisma.devicePushToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'push_token.revoked',
        resource: 'notification',
        resourceId: user.id,
        metadata: { correlationId, revokedCount: revoked.count },
      },
    })
    return successResponse({ revoked: true, revokedCount: revoked.count, correlationId })
  } catch (error) { return handleApiError(error) }
}

export async function GET(_request: NextRequest) {
  try {
    const user = await requireAuth()
    const rows = await prisma.devicePushToken.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return successResponse({
      tokens: rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        token: maskToken(r.token),
        registeredAt: r.createdAt.toISOString(),
      })),
    })
  } catch (error) { return handleApiError(error) }
}
