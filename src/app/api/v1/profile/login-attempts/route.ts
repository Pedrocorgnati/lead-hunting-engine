/**
 * TASK-038 (B13): lista tentativas de login do usuario logado.
 * GET /api/v1/profile/login-attempts
 * - Retorna ultimas 50 tentativas dos ultimos 30 dias.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

const LOGIN_WINDOW_DAYS = 30

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()

    const windowStart = new Date(
      Date.now() - LOGIN_WINDOW_DAYS * 24 * 60 * 60 * 1000
    )

    const attempts = await prisma.loginAttempt.findMany({
      where: {
        email: user.email ?? '',
        timestamp: { gte: windowStart },
      },
      select: {
        id: true,
        ipAddress: true,
        success: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    })

    return successResponse({ attempts })
  } catch (error) {
    return handleApiError(error)
  }
}
