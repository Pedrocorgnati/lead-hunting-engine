import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { leadService } from '@/services/lead.service'
import { UpdateLeadPitchSchema } from '@/schemas/lead.schema'
import { prisma } from '@/lib/prisma'
import { generatePitch } from '@/lib/pitch/pitch-generator'
import { TONE_OPTIONS } from '@/lib/pitch/tone-config'
import { LLMUnavailableError, HallucinatedPitchError, PITCH_ERROR_CODES } from '@/lib/pitch/errors'
import { PITCH_CACHE_TTL_MS } from '@/lib/pitch/constants'
import { snapshotPitchVersion } from '@/lib/services/pitch-version-service'
import { limits } from '@/lib/rate-limiter'

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

    const pitch = lead.pitchContent
      ? {
          content: lead.pitchContent,
          tone: lead.pitchTone ?? 'formal',
          updatedAt: lead.updatedAt,
        }
      : null

    return successResponse(pitch)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth()
    limits.generatePitch(user.id)

    const { id } = await params

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json(
        { error: { code: 'VAL_001', message: 'Body inválido.' } },
        { status: 400 }
      )
    }

    const schema = z.object({ tone: z.enum(TONE_OPTIONS) })
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VAL_002', message: 'Tom inválido.' } },
        { status: 422 }
      )
    }

    const tone = parsed.data.tone

    const lead = await prisma.lead.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        businessName: true,
        category: true,
        city: true,
        state: true,
        phone: true,
        website: true,
        rating: true,
        reviewCount: true,
        score: true,
        scoreBreakdown: true,
        opportunities: true,
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

    // Cache: mesmo tom, atualizado nas últimas 24h → retornar sem chamar LLM (ADR-PITCH-001)
    const cacheValid =
      lead.pitchTone === tone &&
      lead.pitchContent &&
      lead.updatedAt.getTime() >= Date.now() - PITCH_CACHE_TTL_MS

    if (cacheValid) {
      return successResponse(
        { content: lead.pitchContent, tone, cached: true },
        200
      )
    }

    // Extrair digitalGapScore e opportunityLabel
    const breakdown = (lead.scoreBreakdown as Record<string, { score?: number }>) ?? {}
    const digitalGapScore = breakdown.digital_gap?.score ?? lead.score ?? 50
    const opportunityLabel =
      lead.opportunities?.[0] ?? 'C'

    const result = await generatePitch(
      {
        businessName: lead.businessName,
        category: lead.category,
        city: lead.city,
        state: lead.state,
        phone: lead.phone,
        website: lead.website,
        rating: lead.rating ? Number(lead.rating) : null,
        reviewCount: lead.reviewCount,
        digitalGapScore,
        opportunityLabel: String(opportunityLabel),
        scoreBreakdown: breakdown,
      },
      tone
    )

    // Snapshot versao anterior antes de sobrescrever (TASK-11 / CL-199)
    if (lead.pitchContent) {
      await snapshotPitchVersion({
        leadId: id,
        content: lead.pitchContent,
        tone: lead.pitchTone,
        provider: null,
        changedBy: user.id,
      })
    }

    // Persistir no Lead (ADR-PITCH-001: sem tabela separada)
    await prisma.lead.update({
      where: { id },
      data: {
        pitchContent: result.pitch,
        pitchTone: tone,
      },
    })

    return successResponse({ content: result.pitch, tone, cached: false, provider: result.provider })
  } catch (error) {
    if (error instanceof LLMUnavailableError) {
      console.error('[PITCH_050] LLM indisponível:', (error as Error).message)
      return NextResponse.json(
        {
          error: {
            code: PITCH_ERROR_CODES.LLM_UNAVAILABLE,
            message:
              'O serviço de geração de pitch está temporariamente indisponível. Use um template manual ou tente regenerar em instantes.',
          },
          canRetry: true,
          suggestTemplates: true,
        },
        { status: 503 }
      )
    }

    if (error instanceof HallucinatedPitchError) {
      console.warn('[PITCH_051] Pitch rejeitado por anti-alucinação:', (error as HallucinatedPitchError).issues)
      return NextResponse.json(
        {
          error: {
            code: PITCH_ERROR_CODES.HALLUCINATED,
            message:
              'Pitch inválido detectado (conteúdo alucinado). Escolha um template manual para este lead.',
          },
          canRetry: false,
          suggestTemplates: true,
          issues: (error as HallucinatedPitchError).issues,
        },
        { status: 422 }
      )
    }

    return handleApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: Params
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const validated = UpdateLeadPitchSchema.parse(body)

    const previous = await prisma.lead.findFirst({
      where: { id, userId: user.id },
      select: { pitchContent: true, pitchTone: true },
    })
    if (previous?.pitchContent) {
      await snapshotPitchVersion({
        leadId: id,
        content: previous.pitchContent,
        tone: previous.pitchTone,
        provider: null,
        changedBy: user.id,
      })
    }

    const lead = await leadService.updatePitch(id, user.id, validated)
    return successResponse(lead)
  } catch (error) {
    return handleApiError(error)
  }
}
