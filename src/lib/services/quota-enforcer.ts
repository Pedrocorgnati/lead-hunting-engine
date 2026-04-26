import { prisma } from '@/lib/prisma'
import { CollectionJobStatus } from '@/lib/constants/enums'
import { JOB_050, JOB_053 } from '@/constants/errors'

export interface QuotaSnapshot {
  monthly: { used: number; max: number; allowed: boolean; resetAt: string }
  concurrency: { running: number; max: number; allowed: boolean }
}

export type QuotaReason = 'monthly' | 'concurrent'

export class QuotaExceededError extends Error {
  public readonly code: string
  public readonly httpStatus: number

  constructor(
    public readonly reason: QuotaReason,
    message: string,
    public readonly details?: { used?: number; max?: number; running?: number },
  ) {
    super(message)
    this.name = 'QuotaExceededError'
    if (reason === 'monthly') {
      this.code = JOB_053.code
      this.httpStatus = JOB_053.httpStatus
    } else {
      this.code = JOB_050.code
      this.httpStatus = JOB_050.httpStatus
    }
  }
}

const DEFAULT_LEADS_PER_MONTH = 500
const DEFAULT_MAX_CONCURRENT = 3

export class QuotaEnforcer {
  /**
   * Snapshot combinado usado tanto pela UI quanto pelo assert.
   */
  async getSnapshot(userId: string): Promise<QuotaSnapshot> {
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { leadsPerMonthMax: true, maxConcurrentJobs: true },
    })
    const monthlyMax = profile?.leadsPerMonthMax ?? DEFAULT_LEADS_PER_MONTH
    const concurrentMax = profile?.maxConcurrentJobs ?? DEFAULT_MAX_CONCURRENT

    const [monthlyUsed, runningCount] = await Promise.all([
      this.countLeadsThisMonth(userId),
      this.countRunningJobs(userId),
    ])

    return {
      monthly: {
        used: monthlyUsed,
        max: monthlyMax,
        allowed: monthlyUsed < monthlyMax,
        resetAt: nextMonthStart().toISOString(),
      },
      concurrency: {
        running: runningCount,
        max: concurrentMax,
        allowed: runningCount < concurrentMax,
      },
    }
  }

  /**
   * Conta leads criados no mes corrente (UTC, dia 1 00:00).
   * Extraido para permitir mock fino em testes.
   */
  async countLeadsThisMonth(userId: string): Promise<number> {
    return prisma.lead.count({
      where: { userId, createdAt: { gte: monthStart() } },
    })
  }

  async countRunningJobs(userId: string): Promise<number> {
    return prisma.collectionJob.count({
      where: {
        userId,
        status: { in: [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING] },
      },
    })
  }

  async checkMonthlyQuota(userId: string): Promise<{ used: number; max: number; allowed: boolean }> {
    const snap = await this.getSnapshot(userId)
    return snap.monthly
  }

  async checkConcurrency(userId: string): Promise<{ running: number; max: number; allowed: boolean }> {
    const snap = await this.getSnapshot(userId)
    return snap.concurrency
  }

  /**
   * Bloqueia criacao de CollectionJob se qualquer quota excedida.
   * Prioriza concurrent (erro mais acionavel no curto prazo) sobre monthly.
   */
  async assertCanCreateJob(userId: string): Promise<void> {
    const snap = await this.getSnapshot(userId)

    if (!snap.concurrency.allowed) {
      throw new QuotaExceededError(
        'concurrent',
        `Limite de coletas simultaneas atingido (${snap.concurrency.running}/${snap.concurrency.max}).`,
        { running: snap.concurrency.running, max: snap.concurrency.max },
      )
    }

    if (!snap.monthly.allowed) {
      throw new QuotaExceededError(
        'monthly',
        `Quota mensal de leads atingida (${snap.monthly.used}/${snap.monthly.max}).`,
        { used: snap.monthly.used, max: snap.monthly.max },
      )
    }
  }
}

export function monthStart(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export function nextMonthStart(now: Date = new Date()): Date {
  const d = monthStart(now)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

export const quotaEnforcer = new QuotaEnforcer()
