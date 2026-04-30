import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import {
  onboardingProgressPatchSchema,
  getTotalOnboardingSteps,
  type OnboardingData,
} from '@/lib/schemas/onboarding'

/**
 * GET /api/v1/onboarding/progress
 * Retorna { step, data, completed, totalSteps } do usuário autenticado.
 * `totalSteps` é role-aware (ADMIN=5, OPERATOR=3) — TASK-4 milestone-7.
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
      totalSteps: getTotalOnboardingSteps(user.role),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/v1/onboarding/progress
 * Body: { step: number, data?: Partial<OnboardingData> }
 * Faz merge shallow do data existente com o novo.
 *
 * Validação role-aware: rejeita `step > getTotalOnboardingSteps(role)` (400).
 * O zod base aceita até ADMIN_ONBOARDING_STEPS porque o schema não conhece
 * o role; o refinamento fino acontece após `requireAuth`.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const parsed = onboardingProgressPatchSchema.parse(body)

    const maxStep = getTotalOnboardingSteps(user.role)
    if (parsed.step > maxStep) {
      return NextResponse.json(
        {
          error: {
            code: 'ONBOARDING_STEP_OUT_OF_RANGE',
            message: `Step ${parsed.step} excede o máximo de ${maxStep} para o role ${user.role}.`,
          },
        },
        { status: 400 },
      )
    }

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
