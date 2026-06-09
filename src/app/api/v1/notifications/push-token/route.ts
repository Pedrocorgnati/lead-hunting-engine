import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

const TokenSchema = z.object({
  token: z.string().trim().min(1).max(512),
  platform: z.enum(['web', 'android', 'ios']).optional().default('web'),
})

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = TokenSchema.parse(await request.json())
    const correlationId = crypto.randomUUID()

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'push_token.registered',
        resource: 'notification',
        resourceId: user.id,
        metadata: { platform: body.platform, correlationId, tokenLength: body.token.length },
      },
    })

    return successResponse({ registered: true, correlationId, platform: body.platform })
  } catch (error) { return handleApiError(error) }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth()
    const correlationId = crypto.randomUUID()
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'push_token.revoked',
        resource: 'notification',
        resourceId: user.id,
        metadata: { correlationId },
      },
    })
    return successResponse({ revoked: true, correlationId })
  } catch (error) { return handleApiError(error) }
}

export async function GET(_request: NextRequest) {
  try {
    const user = await requireAuth()
    const correlationId = crypto.randomUUID()
    const testRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/v1/notifications/push-token/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal': '1' },
      body: JSON.stringify({ userId: user.id, correlationId }),
    }).catch(() => null)

    const ok = testRes?.ok ?? false
    return NextResponse.json({
      data: {
        testSent: ok,
        correlationId,
        result: ok ? 'success' : 'failure',
      },
    }, { status: 200 })
  } catch (error) { return handleApiError(error) }
}
