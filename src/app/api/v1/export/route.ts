import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { LeadStatus, LeadTemperature } from '@/lib/constants/enums'
import { limits } from '@/lib/rate-limiter'
import { EXPORT_MAX_ROWS } from '@/constants/errors'
import { leadsToJson, type ExportableLead } from '@/lib/export/json'
import { leadsToVcf } from '@/lib/export/vcf'
import { leadsToXlsxBuffer } from '@/lib/export/xlsx'
import { shouldQueueAsync, queueAsyncExport } from '@/lib/export/dispatcher'

// M12-G03: XLSX adicionado como 4o formato (alinha BUDGET.md "planilha em quatro formatos").
const ExportFormat = z.enum(['CSV', 'JSON', 'VCF', 'XLSX'])

const ExportSchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  temperature: z.nativeEnum(LeadTemperature).optional(),
  city: z.string().max(255).optional(),
  niche: z.string().max(255).optional(),
  // M12-B4: score scale 0-100 (alinhado com radar/seeds; corrige bug Codex)
  scoreMin: z.number().int().min(0).max(100).optional(),
  scoreMax: z.number().int().min(0).max(100).optional(),
  search: z.string().max(255).optional(),
  // M12-B1: aceitar type (opportunity) e recency para herdar filtros de /leads (Codex caught: 2 dimensoes faltando)
  type: z.string().max(50).optional(),
  recency: z.enum(['24h', '7d', '30d']).optional(),
  format: z
    .union([ExportFormat, z.literal('csv'), z.literal('json'), z.literal('vcf'), z.literal('xlsx')])
    .default('CSV')
    .transform((v) => v.toUpperCase() as z.infer<typeof ExportFormat>),
})

const MIME: Record<z.infer<typeof ExportFormat>, string> = {
  CSV: 'text/csv; charset=utf-8',
  JSON: 'application/json; charset=utf-8',
  VCF: 'text/vcard; charset=utf-8',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
const EXT: Record<z.infer<typeof ExportFormat>, string> = {
  CSV: 'csv',
  JSON: 'json',
  VCF: 'vcf',
  XLSX: 'xlsx',
}

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = Array.isArray(val) ? val.join(';') : String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function leadsToCsv(leads: ExportableLead[]): string {
  const headers = [
    'ID', 'Nome', 'Categoria', 'Cidade', 'Estado', 'Telefone',
    'Site', 'Email', 'Score', 'Temperatura', 'Oportunidades', 'Status', 'Criado em',
  ]
  const rows = leads.map((l) =>
    [
      l.id, l.businessName, l.category, l.city, l.state,
      l.phone, l.website, l.email, l.score, l.temperature,
      l.opportunities, l.status,
      typeof l.createdAt === 'string'
        ? l.createdAt.split('T')[0]
        : l.createdAt.toISOString().split('T')[0],
    ]
      .map(csvEscape)
      .join(',')
  )
  return [headers.join(','), ...rows].join('\n')
}

/**
 * POST /api/v1/export
 *
 * Body:
 *   { format?: 'CSV'|'JSON'|'VCF' (default CSV), ...filters }
 *
 * Limite sincrono: EXPORT_MAX_ROWS (10000). Acima disso, retorna 413
 * com code `EXPORT_MAX_ROWS_EXCEEDED` orientando uso do async (TASK-22).
 *
 * Origem: TASK-8 intake-review (CL-297, CL-298, CL-299).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    limits.exportLeads(user.id)

    const body = await request.json().catch(() => ({}))
    const parsed = ExportSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Parametros de exportacao invalidos.',
            details: parsed.error.message,
          },
        },
        { status: 422 }
      )
    }

    const { status, temperature, city, niche, scoreMin, scoreMax, search, type, recency, format } =
      parsed.data

    const where: Record<string, unknown> = { userId: user.id }
    if (status) where.status = status
    if (temperature) where.temperature = temperature
    if (city) where.city = { contains: city, mode: 'insensitive' }
    if (niche) where.category = { contains: niche, mode: 'insensitive' }
    // M12-B1: type=opportunity filter (alinha com getLeads em src/actions/leads.ts:173)
    if (type) where.opportunities = { has: type }
    // M12-B1: recency window (alinha com getLeads:177-181)
    if (recency) {
      const hoursMap = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 } as const
      const hours = hoursMap[recency]
      where.createdAt = { gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
    }
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

    const count = await prisma.lead.count({ where })
    if (count > EXPORT_MAX_ROWS) {
      return NextResponse.json(
        {
          error: {
            code: 'EXPORT_MAX_ROWS_EXCEEDED',
            message:
              'Exportacao excede o limite sincrono. Use a exportacao assincrona.',
            details: { count, max: EXPORT_MAX_ROWS },
          },
        },
        { status: 413 }
      )
    }

    // TASK-22 ST002: decisao sync vs async baseada em SystemConfig.export.sync_max_rows
    if (await shouldQueueAsync(count)) {
      const queued = await queueAsyncExport({
        userId: user.id,
        format,
        filters: JSON.parse(
          JSON.stringify({ status, temperature, city, niche, scoreMin, scoreMax, search, type, recency })
        ),
        estimatedRowCount: count,
      })
      return NextResponse.json(
        {
          data: {
            exportId: queued.id,
            status: queued.status,
            expiresAt: queued.expiresEstimate.toISOString(),
            count,
            message:
              'Exportacao enfileirada. Voce recebera uma notificacao quando estiver pronta.',
          },
        },
        { status: 202 }
      )
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { score: 'desc' },
      take: EXPORT_MAX_ROWS,
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

    // M12-G03: XLSX retorna binario (Buffer), demais formatos retornam string.
    const filename = `leads-export-${new Date().toISOString().slice(0, 10)}.${EXT[format]}`
    const commonHeaders = {
      'Content-Type': MIME[format],
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Export-Count': String(leads.length),
      'X-Export-Format': format,
    }

    if (format === 'XLSX') {
      const buffer = leadsToXlsxBuffer(leads as ExportableLead[])
      // Buffer -> Uint8Array para satisfazer BodyInit do NextResponse.
      return new NextResponse(new Uint8Array(buffer), { status: 200, headers: commonHeaders })
    }

    let content: string
    switch (format) {
      case 'JSON':
        content = leadsToJson(leads as ExportableLead[], {
          status,
          temperature,
          city,
          niche,
          scoreMin,
          scoreMax,
          search,
        })
        break
      case 'VCF':
        content = leadsToVcf(leads as ExportableLead[])
        break
      case 'CSV':
      default:
        content = leadsToCsv(leads as ExportableLead[])
    }

    return new NextResponse(content, { status: 200, headers: commonHeaders })
  } catch (error) {
    return handleApiError(error)
  }
}
