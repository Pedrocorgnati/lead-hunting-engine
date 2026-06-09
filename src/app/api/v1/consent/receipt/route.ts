import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { assertRateLimit, getClientIp } from '@/lib/rate-limiter'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { errorResponse, CONSENT_080 } from '@/constants/errors'
import {
  buildConsentReceipt,
  consentReceiptFilename,
  type ConsentSource,
} from '@/lib/consent-receipt'

const querySchema = z.object({
  receiptId: z.string().uuid().optional(),
  format: z.enum(['json', 'download']).optional(),
})

const RECEIPT_SELECT = {
  id: true,
  version: true,
  categories: true,
  acceptedAt: true,
} as const

/**
 * GET /api/v1/consent/receipt — TASK-2/A1 (P0)
 *
 * Recibo LGPD publico. Reutiliza o `LandingConsent` ja persistido por
 * `POST /api/v1/consent` (contrato base nao recriado). Resolucao:
 *   1. `?receiptId={uuid}` — recibo especifico (preferido).
 *   2. fallback: ultimo consent ancorado no hash do IP do solicitante.
 *
 * `?format=download` entrega o recibo como anexo JSON assinado pelo hash.
 * Telas alvo: P15 /consentimento, G8 CookieConsentBanner.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  try {
    assertRateLimit(`consent:receipt:${ip}`, 20)

    const parsed = querySchema.safeParse({
      receiptId: request.nextUrl.searchParams.get('receiptId') ?? undefined,
      format: request.nextUrl.searchParams.get('format') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Parametros de recibo invalidos.',
            details: parsed.error.issues
              .map((i) => `${i.path?.join('.') ?? ''}: ${i.message}`)
              .join('; '),
          },
        },
        { status: 400 },
      )
    }

    const { receiptId, format } = parsed.data

    const consent = receiptId
      ? await prisma.landingConsent.findUnique({
          where: { id: receiptId },
          select: RECEIPT_SELECT,
        })
      : await prisma.landingConsent.findFirst({
          where: { ipHash: createHash('sha256').update(ip).digest('hex') },
          orderBy: { acceptedAt: 'desc' },
          select: RECEIPT_SELECT,
        })

    if (!consent) {
      return NextResponse.json(errorResponse(CONSENT_080), { status: 404 })
    }

    const receipt = buildConsentReceipt(consent as ConsentSource)

    if (format === 'download') {
      return new NextResponse(JSON.stringify(receipt, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${consentReceiptFilename(receipt.receiptId)}"`,
          'Cache-Control': 'private, no-store, max-age=0',
        },
      })
    }

    return successResponse(receipt)
  } catch (err) {
    return handleApiError(err)
  }
}
