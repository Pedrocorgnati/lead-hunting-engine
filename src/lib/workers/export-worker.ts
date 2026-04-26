/**
 * Export worker — processa um ExportHistory.id em background.
 *
 * Origem: TASK-22 intake-review / ST003 (CL-296, CL-304).
 *
 * Fluxo:
 *   1. Marca PROCESSING + startedAt
 *   2. Consulta leads conforme filters persistidos
 *   3. Serializa via TASK-8 (CSV/JSON/VCF)
 *   4. Upload para Supabase Storage bucket `exports/{userId}/{exportId}.{ext}`
 *   5. Gera signed URL com TTL = `export.signed_url_ttl_hours`
 *   6. Marca COMPLETED + fileUrl + expiresAt
 *   7. Dispatch notification EXPORT_READY (in-app + email)
 *
 * Callable:
 *   - Direto (in-process, imediato): `runExportWorker(exportId)`.
 *   - Via trigger.dev: `trigger/tasks/run-export.ts` delega aqui (stub).
 *
 * Observabilidade: falhas vao para Sentry + gravam `error` na row.
 */
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'
import { dispatch } from '@/lib/notifications/dispatcher'
import { leadsToJson, type ExportableLead } from '@/lib/export/json'
import { leadsToVcf } from '@/lib/export/vcf'
import { getExportSettings } from '@/lib/services/system-config'
import type { Prisma } from '@prisma/client'

const BUCKET = 'exports'
const MIME: Record<'CSV' | 'JSON' | 'VCF', string> = {
  CSV: 'text/csv; charset=utf-8',
  JSON: 'application/json; charset=utf-8',
  VCF: 'text/vcard; charset=utf-8',
}
const EXT: Record<'CSV' | 'JSON' | 'VCF', string> = {
  CSV: 'csv',
  JSON: 'json',
  VCF: 'vcf',
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

function serialize(
  format: 'CSV' | 'JSON' | 'VCF',
  leads: ExportableLead[],
  filters: Prisma.JsonValue
): string {
  switch (format) {
    case 'JSON':
      return leadsToJson(leads, (filters ?? {}) as Record<string, unknown>)
    case 'VCF':
      return leadsToVcf(leads)
    case 'CSV':
    default:
      return leadsToCsv(leads)
  }
}

function filtersToWhere(filters: Prisma.JsonValue, userId: string): Record<string, unknown> {
  const f = (filters ?? {}) as Record<string, unknown>
  const where: Record<string, unknown> = { userId }
  if (f.status) where.status = f.status
  if (f.temperature) where.temperature = f.temperature
  if (f.city) where.city = { contains: String(f.city), mode: 'insensitive' }
  if (f.niche) where.category = { contains: String(f.niche), mode: 'insensitive' }
  if (f.scoreMin !== undefined || f.scoreMax !== undefined) {
    where.score = {
      ...(f.scoreMin !== undefined ? { gte: Number(f.scoreMin) } : {}),
      ...(f.scoreMax !== undefined ? { lte: Number(f.scoreMax) } : {}),
    }
  }
  if (f.search) {
    where.OR = [
      { businessName: { contains: String(f.search), mode: 'insensitive' } },
      { city: { contains: String(f.search), mode: 'insensitive' } },
      { category: { contains: String(f.search), mode: 'insensitive' } },
    ]
  }
  return where
}

export async function runExportWorker(exportId: string): Promise<void> {
  const row = await prisma.exportHistory.findUnique({ where: { id: exportId } })
  if (!row) {
    captureException(new Error(`ExportHistory not found: ${exportId}`), { worker: 'export' })
    return
  }

  if (row.status !== 'PENDING') {
    // Idempotencia: worker re-disparado apos retry so processa PENDING.
    return
  }

  await prisma.exportHistory.update({
    where: { id: exportId },
    data: { status: 'PROCESSING', startedAt: new Date() },
  })

  try {
    const settings = await getExportSettings()
    const where = filtersToWhere(row.filters, row.userId)
    const leads = await prisma.lead.findMany({
      where,
      orderBy: { score: 'desc' },
      select: {
        id: true, businessName: true, category: true, city: true, state: true,
        phone: true, website: true, email: true, score: true, temperature: true,
        opportunities: true, status: true, createdAt: true,
      },
    })

    const format = row.format as 'CSV' | 'JSON' | 'VCF'
    const body = serialize(format, leads as ExportableLead[], row.filters)
    const ext = EXT[format]
    const filePath = `${row.userId}/${exportId}.${ext}`

    const supabase = createAdminClient()
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, new Blob([body], { type: MIME[format] }), {
        contentType: MIME[format],
        upsert: true,
      })
    if (uploadError) throw uploadError

    const ttlSec = settings.signedUrlTtlHours * 3600
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, ttlSec)
    if (signErr || !signed?.signedUrl) {
      throw signErr ?? new Error('Signed URL generation returned empty')
    }

    const expiresAt = new Date(Date.now() + ttlSec * 1000)

    await prisma.exportHistory.update({
      where: { id: exportId },
      data: {
        status: 'COMPLETED',
        fileUrl: signed.signedUrl,
        fileSize: body.length,
        rowCount: leads.length,
        completedAt: new Date(),
        expiresAt,
      },
    })

    // R-10 intake-review (CL-304): evento dedicado EXPORT_READY em vez de JOB_COMPLETED.
    try {
      await dispatch({
        event: 'EXPORT_READY',
        userId: row.userId,
        params: {
          format,
          rowCount: leads.length,
          exportId,
          ttlHours: settings.signedUrlTtlHours,
        },
        data: { exportId, format, rowCount: leads.length },
      })
    } catch (dispErr) {
      captureException(dispErr, { worker: 'export', phase: 'dispatch', exportId })
    }
  } catch (err) {
    captureException(err, { worker: 'export', exportId })
    await prisma.exportHistory
      .update({
        where: { id: exportId },
        data: {
          status: 'FAILED',
          error: err instanceof Error ? err.message.slice(0, 500) : 'unknown error',
          completedAt: new Date(),
        },
      })
      .catch(() => undefined)
  }
}

/**
 * Hook de registro trigger.dev (stub). O arquivo
 * `trigger/tasks/run-export.ts` importa e chama `runExportWorker` — mantemos
 * esta indirecao aqui para permitir mock em testes.
 */
export function registerTriggerTask(): void {
  // Implementacao real em `trigger/tasks/run-export.ts`.
  // Este stub existe apenas para documentar o entry point esperado.
}
