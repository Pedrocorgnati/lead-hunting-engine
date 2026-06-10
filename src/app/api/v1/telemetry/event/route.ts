import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { track, makeCorrelationId, TELEMETRY_KINDS, type TelemetryEventKind } from '@/lib/telemetry'

/**
 * POST /api/v1/telemetry/event (C14.1 / item 068)
 *
 * Ingestao de eventos ECU reportados pelo client (abandono de fluxo, lead
 * visualizado, job acompanhado etc.). Server-side flows chamam track()
 * direto — este endpoint cobre o que so o browser sabe.
 *
 * Garantias:
 *  - validacao Zod (kind restrito ao schema canonico TELEMETRY_KINDS);
 *  - deduplicacao: mesmo (kind, correlationId) dentro de 10min e ignorado
 *    (idempotente para retries do client);
 *  - mascaramento de segredos no metadata (track() ja mascara);
 *  - retention: eventos vivem em audit_logs e seguem a politica de retencao
 *    LGPD existente do audit log (retention-sweep).
 */
const BodySchema = z.object({
  kind: z.string().refine((k): k is TelemetryEventKind => (TELEMETRY_KINDS as string[]).includes(k), {
    message: 'kind fora do schema canonico de eventos ECU',
  }),
  correlationId: z.string().trim().min(4).max(120).optional(),
  route: z.string().trim().max(300).optional(),
  resourceId: z.string().trim().max(120).optional(),
  resourceType: z.string().trim().max(60).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const DEDUP_WINDOW_MS = 10 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = BodySchema.parse(await request.json())
    const correlationId = body.correlationId ?? makeCorrelationId('ecu')

    if (body.correlationId) {
      const existing = await prisma.auditLog.findFirst({
        where: {
          action: body.kind,
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
          metadata: { path: ['correlationId'], equals: body.correlationId },
        },
        select: { id: true },
      })
      if (existing) {
        return NextResponse.json(
          { data: { recorded: false, deduplicated: true, correlationId } },
          { status: 200 },
        )
      }
    }

    await track({
      kind: body.kind as TelemetryEventKind,
      correlationId,
      userId: user.id,
      route: body.route,
      resourceId: body.resourceId,
      resourceType: body.resourceType,
      metadata: body.metadata,
    })

    return successResponse({ recorded: true, deduplicated: false, correlationId }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
