import { task, logger } from '@trigger.dev/sdk/v3'
import { runExportWorker } from '@/lib/workers/export-worker'

/**
 * trigger.dev task que processa uma ExportHistory async.
 * Origem: TASK-22 intake-review / ST003 (CL-304).
 *
 * Acionamento:
 *   - Fila por `runExportTask.trigger({ exportId })` no endpoint /export.
 *   - Fallback inline se TRIGGER_SECRET_KEY ausente (ver export-dispatcher).
 */
export const runExportTask = task({
  id: 'run-export',
  run: async (payload: { exportId: string }) => {
    logger.info('Export worker start', { exportId: payload.exportId })
    await runExportWorker(payload.exportId)
    logger.info('Export worker done', { exportId: payload.exportId })
  },
})
