import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/admin/metrics/collections-timeline
 *
 * Serie diaria dos ultimos N dias com { date, jobs, leads, costUsd }.
 *
 * Query:
 *   - days: int 7..90 (default 30)
 *
 * Origem: TASK-13 intake-review / ST001 (CL-115).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const daysRaw = Number(searchParams.get('days') ?? 30)
    const days = Math.min(90, Math.max(7, Number.isFinite(daysRaw) ? daysRaw : 30))

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    since.setUTCHours(0, 0, 0, 0)

    type TimelineRow = {
      bucket: Date
      jobs: bigint
      leads: bigint
      cost_usd: string | null
    }

    const rows = await prisma.$queryRaw<TimelineRow[]>`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', ${since}::timestamp),
          date_trunc('day', NOW()),
          interval '1 day'
        )::date AS bucket
      )
      SELECT
        d.bucket,
        COALESCE(j.jobs, 0)::bigint  AS jobs,
        COALESCE(l.leads, 0)::bigint AS leads,
        COALESCE(c.cost_usd, 0)::text AS cost_usd
      FROM days d
      LEFT JOIN (
        SELECT date_trunc('day', "created_at")::date AS bucket, COUNT(*) AS jobs
        FROM collection_jobs
        WHERE "created_at" >= ${since}
        GROUP BY 1
      ) j ON j.bucket = d.bucket
      LEFT JOIN (
        SELECT date_trunc('day', "created_at")::date AS bucket, COUNT(*) AS leads
        FROM leads
        WHERE "created_at" >= ${since}
        GROUP BY 1
      ) l ON l.bucket = d.bucket
      LEFT JOIN (
        SELECT date_trunc('day', timestamp)::date AS bucket, SUM(cost_usd) AS cost_usd
        FROM api_usage_logs
        WHERE kind = 'LLM' AND timestamp >= ${since}
        GROUP BY 1
      ) c ON c.bucket = d.bucket
      ORDER BY d.bucket ASC
    `

    const series = rows.map((row) => ({
      date:
        row.bucket instanceof Date
          ? row.bucket.toISOString().slice(0, 10)
          : String(row.bucket).slice(0, 10),
      jobs: Number(row.jobs),
      leads: Number(row.leads),
      costUsd: String(row.cost_usd ?? '0'),
    }))

    return successResponse({ days, series })
  } catch (error) {
    return handleApiError(error)
  }
}
