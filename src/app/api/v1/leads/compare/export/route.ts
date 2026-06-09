import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

const ExportCompareSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(4),
  format: z.enum(['csv', 'json']).default('csv'),
})

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { ids, format } = ExportCompareSchema.parse(body)

    const leads = await prisma.lead.findMany({
      where: {
        userId: user.id,
        id: { in: ids },
      },
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
        rating: true,
        reviewCount: true,
        createdAt: true,
      },
      orderBy: { score: 'desc' },
    })

    const date = new Date().toISOString().slice(0, 10)

    if (format === 'json') {
      return new NextResponse(JSON.stringify(leads, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="leads-compare-${date}.json"`,
        },
      })
    }

    const csvEscape = (val: unknown): string => {
      if (val === null || val === undefined) return ''
      const str = Array.isArray(val) ? val.join(';') : String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const headers = [
      'ID', 'Nome', 'Categoria', 'Cidade', 'Estado', 'Telefone', 'Site',
      'Email', 'Score', 'Temperatura', 'Oportunidades', 'Status', 'Rating', 'Reviews', 'Criado em',
    ]
    const rows = leads.map((l) =>
      [
        l.id,
        l.businessName,
        l.category,
        l.city,
        l.state,
        l.phone,
        l.website,
        l.email,
        l.score,
        l.temperature,
        l.opportunities,
        l.status,
        l.rating ?? '',
        l.reviewCount ?? '',
        l.createdAt.toISOString().split('T')[0],
      ].map(csvEscape).join(','),
    )

    const csv = [headers.join(','), ...rows].join('\n')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-compare-${date}.csv"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
