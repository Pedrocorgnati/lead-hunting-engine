import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import {
  onboardingProgressPatchSchema,
  TOTAL_ONBOARDING_STEPS,
  type OnboardingData,
} from '@/lib/schemas/onboarding'

/**
 * GET /api/v1/onboarding/progress
 * Retorna { step, data } do usuário autenticado.
 */
export async function GET() {
  try {
    const user = await requireAuth()

    const profile = await prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { onboardingStep: true, onboardingData: true, onboardingCompletedAt: true },
    })

    return successResponse({
      step: profile?.onboardingStep ?? 0,
      data: (profile?.onboardingData as OnboardingData | null) ?? {},
      completed: Boolean(profile?.onboardingCompletedAt),
      totalSteps: TOTAL_ONBOARDING_STEPS,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/v1/onboarding/progress
 * Body: { step: number, data?: Partial<OnboardingData> }
 * Faz merge shallow do data existente com o novo.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const parsed = onboardingProgressPatchSchema.parse(body)

    const current = await prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { onboardingData: true },
    })

    const mergedData: OnboardingData = {
      ...((current?.onboardingData as OnboardingData | null) ?? {}),
      ...(parsed.data ?? {}),
    }

    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: {
        onboardingStep: parsed.step,
        onboardingData: mergedData as unknown as object,
      },
      select: { onboardingStep: true, onboardingData: true },
    })

    return successResponse({
      step: updated.onboardingStep,
      data: updated.onboardingData as OnboardingData,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export const dynamic = 'force-dynamic'
