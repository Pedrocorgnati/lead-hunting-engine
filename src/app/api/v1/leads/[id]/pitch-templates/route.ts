import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { TONE_OPTIONS } from '@/lib/pitch/tone-config'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const lead = await prisma.lead.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        pitchContent: true,
        pitchTone: true,
        updatedAt: true,
      },
    })

    if (!lead) {
      return NextResponse.json(
        { error: { code: 'LEAD_080', message: 'Lead não encontrado.' } },
        { status: 404 }
      )
    }

    // Retorna os 3 tons com o pitch salvo (se o tom bater) ou null
    const byTone = TONE_OPTIONS.map((tone) => ({
      tone,
      available: true,
      lastPitch:
        lead.pitchContent && lead.pitchTone === tone
          ? {
              content: lead.pitchContent,
              tone: lead.pitchTone,
              updatedAt: lead.updatedAt,
            }
          : null,
    }))

    return successResponse(byTone)
  } catch (error) {
    return handleApiError(error)
  }
}
