/**
 * Export dispatcher — decide sync vs async baseado em
 * `SystemConfig.export.sync_max_rows` e orquestra a criacao de ExportHistory
 * + kickoff do worker.
 *
 * Origem: TASK-22 intake-review / ST002, ST003 (CL-296, CL-304).
 */
import { prisma } from '@/lib/prisma'
import { getExportSettings } from '@/lib/services/system-config'
import { captureException } from '@/lib/observability/sentry'
import type { Prisma } from '@prisma/client'

export interface QueueExportInput {
  userId: string
  format: 'CSV' | 'JSON' | 'VCF'
  filters: Prisma.InputJsonValue
  estimatedRowCount: number
}

export interface QueuedExport {
  id: string
  status: 'PENDING'
  expiresEstimate: Date
}

/**
 * Cria ExportHistory em PENDING e dispara worker.
 * Retorna o registro criado para resposta HTTP 202.
 */
export async function queueAsyncExport(input: QueueExportInput): Promise<QueuedExport> {
  const settings = await getExportSettings()
  const expiresEstimate = new Date(Date.now() + settings.signedUrlTtlHours * 3600 * 1000)

  const row = await prisma.exportHistory.create({
    data: {
      userId: input.userId,
      format: input.format,
      status: 'PENDING',
      filters: input.filters,
      rowCount: input.estimatedRowCount,
      expiresAt: expiresEstimate,
    },
  })

  // Kickoff: trigger.dev quando TRIGGER_SECRET_KEY presente; senao inline.
  await kickoffWorker(row.id).catch((err) => {
    captureException(err, { layer: 'export-dispatcher', exportId: row.id })
  })

  return { id: row.id, status: 'PENDING', expiresEstimate }
}

async function kickoffWorker(exportId: string): Promise<void> {
  if (process.env.TRIGGER_SECRET_KEY) {
    try {
      // Import dinamico — mantem bundle server-side enxuto + evita quebra de build
      // quando trigger.dev nao esta disponivel ainda.
      const mod = (await import('../../../trigger/tasks/run-export')) as {
        runExportTask: { trigger: (payload: { exportId: string }) => Promise<unknown> }
      }
      await mod.runExportTask.trigger({ exportId })
      return
    } catch (err) {
      captureException(err, { layer: 'export-dispatcher', mode: 'trigger' })
      // Fall through para inline
    }
  }

  // Inline: util em dev e fallback quando trigger.dev indisponivel.
  // Nao await para nao bloquear resposta HTTP.
  const { runExportWorker } = await import('@/lib/workers/export-worker')
  void runExportWorker(exportId).catch((err) => {
    captureException(err, { layer: 'export-dispatcher', mode: 'inline', exportId })
  })
}

/** Decide sync vs async; retorna true se deve enfileirar. */
export async function shouldQueueAsync(estimatedRowCount: number): Promise<boolean> {
  const { syncMaxRows } = await getExportSettings()
  return estimatedRowCount > syncMaxRows
}
