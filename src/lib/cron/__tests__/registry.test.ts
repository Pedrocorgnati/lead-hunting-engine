import fs from 'fs'
import path from 'path'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    systemConfig: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}))

import { CRON_REGISTRY, getCronJob, nextRunFromCron, listCronJobs } from '../registry'
import { CRON_RUNNERS } from '../runners'

describe('CRON_REGISTRY', () => {
  it('espelha exatamente os crons de vercel.json (path + schedule)', () => {
    const vercel = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8'),
    ) as { crons: Array<{ path: string; schedule: string }> }

    expect(vercel.crons).toHaveLength(CRON_REGISTRY.length)
    for (const cron of vercel.crons) {
      const match = CRON_REGISTRY.find((j) => j.path === cron.path)
      expect(match).toBeDefined()
      expect(match?.schedule).toBe(cron.schedule)
    }
  })

  it('tem runner manual registrado para todo job (1:1)', () => {
    const registryIds = CRON_REGISTRY.map((j) => j.id).sort()
    const runnerIds = Object.keys(CRON_RUNNERS).sort()
    expect(runnerIds).toEqual(registryIds)
  })

  it('getCronJob resolve por id e retorna undefined para desconhecido', () => {
    expect(getCronJob('check-alerts')?.path).toBe('/api/v1/cron/check-alerts')
    expect(getCronJob('nao-existe')).toBeUndefined()
  })
})

describe('nextRunFromCron', () => {
  const base = new Date('2026-06-09T10:07:30Z')

  it('calcula proximo slot de */5 (a cada 5 min)', () => {
    expect(nextRunFromCron('*/5 * * * *', base)?.toISOString()).toBe('2026-06-09T10:10:00.000Z')
  })

  it('calcula proximo slot de */2 (a cada 2 min)', () => {
    expect(nextRunFromCron('*/2 * * * *', base)?.toISOString()).toBe('2026-06-09T10:08:00.000Z')
  })

  it('calcula diaria fixa no mesmo dia quando ainda nao passou', () => {
    const early = new Date('2026-06-09T01:00:00Z')
    expect(nextRunFromCron('0 3 * * *', early)?.toISOString()).toBe('2026-06-09T03:00:00.000Z')
  })

  it('rola diaria fixa para o dia seguinte quando ja passou', () => {
    expect(nextRunFromCron('0 3 * * *', base)?.toISOString()).toBe('2026-06-10T03:00:00.000Z')
  })

  it('avanca para o proximo minuto mesmo quando o instante atual casa', () => {
    const exact = new Date('2026-06-09T10:10:00Z')
    expect(nextRunFromCron('*/5 * * * *', exact)?.toISOString()).toBe('2026-06-09T10:15:00.000Z')
  })

  it('retorna null para expressoes fora do subconjunto suportado', () => {
    expect(nextRunFromCron('0 3 1 * *', base)).toBeNull()
    expect(nextRunFromCron('0 3 * * 1', base)).toBeNull()
    expect(nextRunFromCron('invalida', base)).toBeNull()
  })
})

describe('listCronJobs', () => {
  it('retorna todos os jobs ACTIVE com lastRunAt null quando nao ha tracking', async () => {
    const jobs = await listCronJobs(new Date('2026-06-09T10:00:00Z'))
    expect(jobs).toHaveLength(CRON_REGISTRY.length)
    for (const job of jobs) {
      expect(job.status).toBe('ACTIVE')
      expect(job.lastRunAt).toBeNull()
      expect(job.nextRunAt).not.toBeNull()
    }
  })

  it('marca DISABLED e zera nextRunAt quando pausado', async () => {
    const { prisma } = jest.requireMock('@/lib/prisma') as {
      prisma: { systemConfig: { findMany: jest.Mock } }
    }
    prisma.systemConfig.findMany.mockResolvedValueOnce([
      { key: 'cron.paused.check-alerts', value: { value: true } },
      { key: 'cron.last_run.check-alerts', value: { at: '2026-06-09T09:55:00.000Z', outcome: 'ok' } },
    ])
    const jobs = await listCronJobs(new Date('2026-06-09T10:00:00Z'))
    const paused = jobs.find((j) => j.id === 'check-alerts')
    expect(paused?.status).toBe('DISABLED')
    expect(paused?.nextRunAt).toBeNull()
    expect(paused?.lastRunAt).toBe('2026-06-09T09:55:00.000Z')
    expect(paused?.lastOutcome).toBe('ok')
  })
})
