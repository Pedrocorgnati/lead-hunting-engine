import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { diffLeadSnapshots, diffToCsv } from '@/lib/leads/radar-snapshot'

/**
 * POST /api/v1/leads/:id/snapshots/diff/export[?from=<id>&to=<id>]
 *
 * Exporta o diff real entre snapshots como CSV inline (attachment), sem URL
 * intermediaria. Task 35 / B10.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lead = await prisma.lead.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!lead) return new Response(JSON.stringify({ error: { code: 'LEAD_080' } }), { status: 404 })

    const { searchParams } = new URL(req.url)
    const result = await diffLeadSnapshots(id, searchParams.get('from'), searchParams.get('to'))
    if (result.reason) {
      return NextResponse.json(
        { error: { code: 'DIFF_UNAVAILABLE', message: result.reason } },
        { status: 422 },
      )
    }

    return new NextResponse(diffToCsv(result), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="radar-diff-${id}.csv"`,
      },
    })
  } catch (e) { return handleApiError(e) }
}
