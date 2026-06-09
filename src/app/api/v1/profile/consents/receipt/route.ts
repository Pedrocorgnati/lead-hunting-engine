import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { assertRateLimit } from '@/lib/rate-limiter'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { errorResponse, CONSENT_080 } from '@/constants/errors'
import {
  buildConsentReceipt,
  consentReceiptFilename,
  hashConsentReceipt,
  type ConsentSource,
} from '@/lib/consent-receipt'

const BASE_PATH = '/api/v1/profile/consents/receipt'

const RECEIPT_SELECT = {
  id: true,
  version: true,
  categories: true,
  acceptedAt: true,
} as const

/**
 * GET /api/v1/profile/consents/receipt — TASK-2/A1 (P0)
 *
 * Recibo LGPD autenticado do titular. Resolve os consents do usuario
 * (UserProfile) pelos vinculos por email em WaitlistEntry/ContactMessage
 * (`consentId` -> LandingConsent), reutilizando o contrato base sem
 * recria-lo. Retorna o recibo mais recente + historico minimo.
 *
 * `?format=download` entrega o recibo atual como anexo JSON.
 * Telas alvo: A26 /perfil/privacidade, AD26 /admin/dsar.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()

    assertRateLimit(`profile:consents:receipt:${user.id}`, 20)

    const [waitlist, contacts] = await Promise.all([
      prisma.waitlistEntry.findMany({
        where: { email: user.email },
        select: { id: true, consentId: true },
      }),
      prisma.contactMessage.findMany({
        where: { email: user.email },
        select: { id: true, consentId: true },
      }),
    ])

    const consentIds = Array.from(
      new Set(
        [...waitlist, ...contacts]
          .map((r) => r.consentId)
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const waitlistIds = waitlist.map((r) => r.id)
    const contactIds = contacts.map((r) => r.id)

    if (consentIds.length === 0 && waitlistIds.length === 0 && contactIds.length === 0) {
      return NextResponse.json(errorResponse(CONSENT_080), { status: 404 })
    }

    const consents = await prisma.landingConsent.findMany({
      where: {
        OR: [
          ...(consentIds.length > 0 ? [{ id: { in: consentIds } }] : []),
          ...(waitlistIds.length > 0 ? [{ waitlistEntryId: { in: waitlistIds } }] : []),
          ...(contactIds.length > 0 ? [{ contactMessageId: { in: contactIds } }] : []),
        ],
      },
      orderBy: { acceptedAt: 'desc' },
      select: RECEIPT_SELECT,
    })

    if (consents.length === 0) {
      return NextResponse.json(errorResponse(CONSENT_080), { status: 404 })
    }

    const [latest, ...previous] = consents as ConsentSource[]
    const receipt = buildConsentReceipt(latest, BASE_PATH)

    const format = request.nextUrl.searchParams.get('format')
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

    const history = previous.map((c) => ({
      receiptId: c.id,
      policyVersion: c.version,
      acceptedAt: c.acceptedAt.toISOString(),
      hash: hashConsentReceipt(c),
    }))

    return successResponse({ ...receipt, history })
  } catch (err) {
    return handleApiError(err)
  }
}
