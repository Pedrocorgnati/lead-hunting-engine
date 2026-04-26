import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { radarService } from '@/lib/services/radar-service'
import { DataSource } from '@/lib/constants/enums'

const RecollectBody = z.object({
  city: z.string().min(1).max(255),
  state: z.string().max(100).nullable().optional(),
  niche: z.string().min(1).max(255),
  limit: z.number().int().min(1).max(500).optional(),
  sources: z.array(z.nativeEnum(DataSource)).min(1).max(5).optional(),
})

/**
 * POST /api/v1/radar/recollect
 *
 * Dispara recoleta a partir de um preset (CL-102).
 * Valida quota (maxConcurrentJobs + leadsPerMonthMax) antes de criar o CollectionJob.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = RecollectBody.parse(await req.json())

    const { jobId } = await radarService.recollect(user.id, {
      city: body.city,
      state: body.state ?? null,
      niche: body.niche,
      limit: body.limit,
      sources: body.sources,
    })

    return NextResponse.json({ data: { jobId } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
