import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    const user = await requireAuth()

    // Idempotente: só atualiza se ainda não concluído
    const profile = await prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { onboardingCompletedAt: true },
    })

    if (!profile?.onboardingCompletedAt) {
      await prisma.userProfile.update({
        where: { id: user.id },
        data: { onboardingCompletedAt: new Date() },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
