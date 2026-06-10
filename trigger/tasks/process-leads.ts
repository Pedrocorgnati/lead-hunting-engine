import { task, logger } from '@trigger.dev/sdk/v3'
import { runProcessLeads, type ProcessLeadsCorePayload } from '@/lib/workers/process-leads-core'

export type ProcessLeadsPayload = ProcessLeadsCorePayload

/**
 * Trigger task `process-leads` — envelope fino sobre o core compartilhado
 * (src/lib/workers/process-leads-core.ts), que tambem roda encadeado ao
 * collect-leads e via local-queue (sem trigger.dev).
 */
export const processLeadsTask = task({
  id: 'process-leads',
  run: async (payload: ProcessLeadsPayload) => {
    return runProcessLeads(payload, {
      info: (m) => logger.info(m),
      warn: (m) => logger.warn(m),
      error: (m) => logger.error(m),
    })
  },
})
