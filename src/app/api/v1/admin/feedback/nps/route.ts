import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { npsService } from '@/services/nps.service'
import type { NpsBucket } from '@/lib/schemas/nps'

/**
 * GET /api/v1/admin/feedback/nps
 *   Retorna agregacao de NPS + comentarios para o painel admin (M14-G-012).
 *
 * Query params:
 *   period: '7d' | '30d' | '90d' | 'custom'
 *   from, to: ISO datetime (apenas com period=custom)
 *   bucket: 'detractor' | 'passive' | 'promoter' (filtro de comentarios)
 */

const PERIOD_MAP: Record<string, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  custom: null,
}

export async function GET(request: Request) {
  try {
    await requireAdmin()

    const url = new URL(request.url)
    const period = url.searchParams.get('period') ?? '30d'
    const bucketParam = url.searchParams.get('bucket') as NpsBucket | null
    const bucket: NpsBucket | undefined =
      bucketParam === 'detractor' || bucketParam === 'passive' || bucketParam === 'promoter'
        ? bucketParam
        : undefined

    let periodStart: Date | undefined
    let periodEnd: Date | undefined

    if (period === 'custom') {
      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      if (from) periodStart = new Date(from)
      if (to) periodEnd = new Date(to)
    } else if (PERIOD_MAP[period] != null) {
      const days = PERIOD_MAP[period]!
      periodEnd = new Date()
      periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    }

    const [aggregate, comments] = await Promise.all([
      npsService.aggregate(periodStart, periodEnd),
      npsService.listComments({ bucket, periodStart, periodEnd, limit: 50 }),
    ])

    return NextResponse.json({
      period,
      from: periodStart?.toISOString() ?? null,
      to: periodEnd?.toISOString() ?? null,
      aggregate,
      comments,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
