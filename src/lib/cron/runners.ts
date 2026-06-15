/**
 * Mapa id -> runner para trigger manual de cron jobs (AD29).
 *
 * Cada runner invoca a MESMA funcao que o cron route correspondente executa,
 * via dynamic import (evita carregar todos os workers no bundle da listagem).
 * Deve cobrir 1:1 os ids de CRON_REGISTRY (garantido por teste).
 */
export const CRON_RUNNERS: Record<string, () => Promise<unknown>> = {
  'retention-cleanup': async () => {
    const { runRetentionCleanup } = await import('@/lib/jobs/retention-cleanup')
    return runRetentionCleanup()
  },
  'credential-check': async () => {
    const { runCredentialExpiringJob } = await import('@/lib/jobs/api-credential-expiring')
    return runCredentialExpiringJob()
  },
  'check-alerts': async () => {
    const [{ checkLlmMonthlyThreshold }, { checkApiDailyThreshold }, { checkStuckJobs }] =
      await Promise.all([
        import('@/lib/alerts/llm-threshold'),
        import('@/lib/alerts/api-daily'),
        import('@/lib/alerts/stuck-jobs'),
      ])
    const [llmMonthly, apiDaily, stuckJobs] = await Promise.all([
      checkLlmMonthlyThreshold(),
      checkApiDailyThreshold(),
      checkStuckJobs(),
    ])
    return { llmMonthly, apiDaily, stuckJobs }
  },
  'drain-local-queue': async () => {
    const { runDrainLocalQueue } = await import('@/lib/workers/drain-local-queue')
    return runDrainLocalQueue()
  },
  'retention-sweep': async () => {
    const { runRetentionSweep } = await import('@/lib/workers/retention-sweeper')
    return runRetentionSweep()
  },
  'lgpd-cleanup': async () => {
    const { runLgpdRetentionCleanup } = await import('@/lib/jobs/lgpd-retention-cleanup')
    return runLgpdRetentionCleanup()
  },
  'outreach-scheduler': async () => {
    const { runOutreachScheduler } = await import('@/lib/workers/outreach-scheduler')
    return runOutreachScheduler()
  },
  'radar-recurrence': async () => {
    const { radarService } = await import('@/lib/services/radar-service')
    return radarService.runRecurringRecollection()
  },
}
