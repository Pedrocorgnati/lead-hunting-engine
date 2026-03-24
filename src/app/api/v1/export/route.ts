import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { LeadStatus, LeadTemperature, OpportunityType } from '@/lib/constants/enums'
import { Limits } from '@/lib/constants/limits'

const MAX_EXPORT = Limits.MAX_COLLECTION_SIZE // 500

const ExportSchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  temperature: z.nativeEnum(LeadTemperature).optional(),
  city: z.string().max(255).optional(),
  niche: z.string().max(255).optional(),
  scoreMin: z.number().int().min(0).max(10).optional(),
  scoreMax: z.number().int().min(0).max(10).optional(),
  search: z.string().max(255).optional(),
  format: z.enum(['csv']).default('csv'),
})

/**
 * POST /api/v1/export
 * Exporta até 500 leads do usuário autenticado como CSV.
 * Body: { status?, temperature?, city?, niche?, scoreMin?, scoreMax?, search?, format? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()

    const body = await request.json()
    const parsed = ExportSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Parâmetros de exportação inválidos.', details: parsed.error.message } },
        { status: 422 }
      )
    }

    const { status, temperature, city, niche, scoreMin, scoreMax, search } = parsed.data

    // Construir filtro WHERE (RLS: sempre filtrar por userId)
    const where: Record<string, unknown> = { userId: user.id }
    if (status) where.status = status
    if (temperature) where.temperature = temperature
    if (city) where.city = { contains: city, mode: 'insensitive' }
    if (niche) where.category = { contains: niche, mode: 'insensitive' }
    if (scoreMin !== undefined || scoreMax !== undefined) {
      where.score = {
        ...(scoreMin !== undefined ? { gte: scoreMin } : {}),
        ...(scoreMax !== undefined ? { lte: scoreMax } : {}),
      }
    }
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ]
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { score: 'desc' },
      take: MAX_EXPORT,
      select: {
        id: true,
        businessName: true,
        category: true,
        city: true,
        state: true,
        phone: true,
        website: true,
        email: true,
        score: true,
        temperature: true,
        opportunities: true,
        status: true,
        createdAt: true,
      },
    })

    // Construir CSV com escape adequado
    const csvEscape = (val: unknown): string => {
      if (val === null || val === undefined) return ''
      const str = Array.isArray(val) ? val.join(';') : String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const headers = [
      'ID', 'Nome', 'Categoria', 'Cidade', 'Estado', 'Telefone',
      'Site', 'Email', 'Score', 'Temperatura', 'Oportunidades', 'Status', 'Criado em',
    ]

    const rows = leads.map((l) =>
      [
        l.id, l.businessName, l.category, l.city, l.state,
        l.phone, l.website, l.email, l.score, l.temperature,
        l.opportunities, l.status,
        l.createdAt.toISOString().split('T')[0],
      ].map(csvEscape).join(',')
    )

    const csv = [headers.join(','), ...rows].join('\n')
    const filename = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Count': String(leads.length),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
