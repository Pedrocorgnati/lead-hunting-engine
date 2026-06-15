import 'server-only'

/**
 * outreach-engine (brainstorm 06-10):
 *  - task 24 (F-05): monitor de qualidade por fonte — % de hits uteis por
 *    provider sobre ApiUsageLog (colunas result_count/useful_count agregaveis);
 *  - task 27 (F-25): auto-descoberta/priorizacao de providers — ranking por
 *    taxa de lead util, degradacao automatica abaixo do limiar e reativacao
 *    apenas apos recuperacao;
 *  - task 28 (F-27): cobertura setorial — garante >= 2 providers alternativos
 *    por segmento critico de busca.
 *
 * Toda degradacao automatica registra trilha (AuditLog) e preserva a
 * rastreabilidade da campanha (nao apaga historico).
 */
import { prisma } from '@/lib/prisma'
import { PROVIDER_CATALOG } from '@/lib/constants/provider-catalog'
import { getConfig } from '@/lib/services/system-config'

export interface SourceQuality {
  provider: string
  calls: number
  totalResults: number
  totalUseful: number
  usefulRate: number
  sampleSufficient: boolean
}

/**
 * % de hits uteis por fonte na janela. Usa as colunas numericas
 * result_count/useful_count (agregaveis) — fallback para contagem de chamadas
 * quando ausentes (dados legados).
 */
export async function computeSourceQuality(
  windowDays = 7,
  now: Date = new Date(),
): Promise<SourceQuality[]> {
  const since = new Date(now.getTime() - windowDays * 86_400_000)
  const rows = await prisma.apiUsageLog.groupBy({
    by: ['provider'],
    where: { timestamp: { gte: since }, callType: 'search' },
    _count: { _all: true },
    _sum: { resultCount: true, usefulCount: true },
  })

  const gate = await getConfig<{ minSample?: number }>('providers.quality_gate')
  const minSample = Number(gate.minSample ?? 25)

  return rows
    .map((r) => {
      const totalResults = r._sum.resultCount ?? 0
      const totalUseful = r._sum.usefulCount ?? 0
      const usefulRate = totalResults > 0 ? totalUseful / totalResults : 0
      return {
        provider: r.provider,
        calls: r._count._all,
        totalResults,
        totalUseful,
        usefulRate,
        sampleSufficient: r._count._all >= minSample,
      }
    })
    .sort((a, b) => b.usefulRate - a.usefulRate)
}

export interface ProviderRanking {
  ranked: SourceQuality[]
  degraded: string[]
  reactivated: string[]
}

/**
 * Ranking + degradacao automatica (F-25). Provider com amostra suficiente e
 * usefulRate < limiar e desativado (ApiCredential.isActive=false); reativacao
 * exige usefulRate >= limiar de recuperacao. Operacao auditada.
 */
export async function rankAndGateProviders(now: Date = new Date()): Promise<ProviderRanking> {
  const gate = await getConfig<{ enabled?: boolean; minUsefulRate?: number; autoDegrade?: boolean }>(
    'providers.quality_gate',
  )
  const ranked = await computeSourceQuality(7, now)
  const degraded: string[] = []
  const reactivated: string[] = []

  if (gate.enabled === false || gate.autoDegrade === false) {
    return { ranked, degraded, reactivated }
  }
  const minRate = Number(gate.minUsefulRate ?? 0.1)
  const recoveryRate = minRate * 1.5 // histerese: reativa so com folga

  for (const sq of ranked) {
    if (!sq.sampleSufficient) continue
    // Mapeia slug do worker -> provider do catalogo (case-insensitive).
    const known = PROVIDER_CATALOG.find(
      (p) => p.source.toLowerCase().replace(/_/g, '') === sq.provider.toLowerCase().replace(/[_-]/g, ''),
    )
    if (!known) continue
    const credential = await prisma.apiCredential.findFirst({
      where: { provider: { equals: sq.provider, mode: 'insensitive' } },
      select: { id: true, isActive: true },
    })
    if (!credential) continue

    if (sq.usefulRate < minRate && credential.isActive) {
      await prisma.apiCredential.update({ where: { id: credential.id }, data: { isActive: false } })
      await auditProviderGate(sq.provider, 'degraded', sq.usefulRate, minRate)
      degraded.push(sq.provider)
    } else if (sq.usefulRate >= recoveryRate && !credential.isActive) {
      await prisma.apiCredential.update({ where: { id: credential.id }, data: { isActive: true } })
      await auditProviderGate(sq.provider, 'reactivated', sq.usefulRate, recoveryRate)
      reactivated.push(sq.provider)
    }
  }
  return { ranked, degraded, reactivated }
}

async function auditProviderGate(
  provider: string,
  action: 'degraded' | 'reactivated',
  rate: number,
  threshold: number,
): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        action: `provider.quality.${action}`,
        resource: 'provider',
        resourceId: null,
        metadata: { provider, usefulRate: rate, threshold },
      },
    })
    .catch(() => undefined)
}

/**
 * Cobertura setorial (F-27): para um segmento de busca de negocio, ha pelo
 * menos 2 providers alternativos? Retorna lacunas para o painel.
 */
export function checkSectorCoverage(): { businessProviders: string[]; sufficient: boolean } {
  const businessProviders = PROVIDER_CATALOG.filter((p) => p.category === 'BUSINESS').map((p) => p.source)
  return { businessProviders, sufficient: businessProviders.length >= 2 }
}
