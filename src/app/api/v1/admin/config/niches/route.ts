import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { CreateNicheSchema } from '@/schemas/config.schema'

export async function GET() {
  try {
    await requireAdmin()
    const niches = await prisma.niche.findMany({ orderBy: { label: 'asc' } })
    return successResponse(niches)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const data = CreateNicheSchema.parse(await request.json())
    const niche = await prisma.niche.create({ data })
    return successResponse(niche, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
