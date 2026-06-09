import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { errorResponse, JOB_080 } from '@/constants/errors'
import { prisma } from '@/lib/prisma'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const job = await prisma.collectionJob.findUnique({
      where: { id },
      select: { userId: true, niche: true, city: true },
    })
    if (!job || job.userId !== user.id) {
      return NextResponse.json(errorResponse(JOB_080), { status: 404 })
    }

    const leads = await prisma.lead.findMany({
      where: { jobId: id },
      select: {
        businessName: true,
        category: true,
        city: true,
        state: true,
        phone: true,
        email: true,
        website: true,
        score: true,
        status: true,
      },
      orderBy: { score: 'desc' },
    })

    const header = 'Nome,Categoria,Cidade,Estado,Telefone,Email,Website,Score,Status'
    const rows = leads.map((l) =>
      [
        l.businessName,
        l.category ?? '',
        l.city ?? '',
        l.state ?? '',
        l.phone ?? '',
        l.email ?? '',
        l.website ?? '',
        l.score,
        l.status,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
    const csv = [header, ...rows].join('\r\n')
    const filename = `coleta-${id}-parcial.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
