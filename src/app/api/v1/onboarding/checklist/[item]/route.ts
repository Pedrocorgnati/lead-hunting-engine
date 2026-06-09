import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { CHECKLIST_ITEMS } from '../route'

const VALID_ITEM_IDS = CHECKLIST_ITEMS.map((i) => i.id)

const PatchSchema = z.object({
  completed: z.boolean(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ item: string }> },
) {
  try {
    const user = await requireAuth()
    const { item: itemId } = await params

    if (!VALID_ITEM_IDS.includes(itemId as (typeof VALID_ITEM_IDS)[number])) {
      return NextResponse.json(
        { error: { code: 'ITEM_NOT_FOUND', message: `Item de checklist desconhecido: ${itemId}` } },
        { status: 404 },
      )
    }

    const body = PatchSchema.parse(await request.json())

    const profile = await prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { onboardingData: true },
    })

    const data = (profile?.onboardingData as Record<string, unknown> | null) ?? {}
    const current = Array.isArray(data.checklist_completed) ? (data.checklist_completed as string[]) : []

    const updated = body.completed
      ? Array.from(new Set([...current, itemId]))
      : current.filter((id) => id !== itemId)

    await prisma.userProfile.update({
      where: { id: user.id },
      data: {
        onboardingData: { ...(data as object), checklist_completed: updated },
      },
    })

    return successResponse({ itemId, completed: body.completed })
  } catch (error) {
    return handleApiError(error)
  }
}
