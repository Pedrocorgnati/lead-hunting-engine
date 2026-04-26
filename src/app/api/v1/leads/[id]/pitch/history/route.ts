import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { listPitchVersions, snapshotPitchVersion } from '@/lib/services/pitch-version-service'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const exists = await prisma.lead.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!exists) {
      return NextResponse.json(
        { error: { code: 'LEAD_080', message: 'Lead não encontrado.' } },
        { status: 404 }
      )
    }
    const versions = await listPitchVersions(id)
    return successResponse({ leadId: id, versions })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/v1/leads/[id]/pitch/history — restaura versao selecionada.
 * Body: { versionId: string }
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const schema = z.object({ versionId: z.string().uuid() })
    const parsed = schema.parse(body)

    const lead = await prisma.lead.findFirst({
      where: { id, userId: user.id },
      select: { id: true, pitchContent: true, pitchTone: true },
    })
    if (!lead) {
      return NextResponse.json(
        { error: { code: 'LEAD_080', message: 'Lead não encontrado.' } },
        { status: 404 }
      )
    }

    const version = await prisma.pitchVersion.findUnique({ where: { id: parsed.versionId } })
    if (!version || version.leadId !== id) {
      return NextResponse.json(
        { error: { code: 'PITCH_060', message: 'Versao de pitch nao encontrada.' } },
        { status: 404 }
      )
    }

    if (lead.pitchContent) {
      await snapshotPitchVersion({
        leadId: id,
        content: lead.pitchContent,
        tone: lead.pitchTone,
        provider: null,
        changedBy: user.id,
      })
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: { pitchContent: version.content, pitchTone: version.tone },
      select: { id: true, pitchContent: true, pitchTone: true },
    })

    return successResponse({ restored: true, lead: updated })
  } catch (error) {
    return handleApiError(error)
  }
}
