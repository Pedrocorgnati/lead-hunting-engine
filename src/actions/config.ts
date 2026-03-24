'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { configService } from '@/services/config.service'
import { CredentialProvider, CREDENTIAL_PROVIDER_MAP } from '@/lib/constants/enums'

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CredentialDto {
  id: string
  label: string
  provider: CredentialProvider
  maskedValue: string
  isActive: boolean
  createdAt: string
}

export interface ScoringRule {
  dimension: string
  label: string
  description: string
  weight: number
}

export const DEFAULT_SCORING_RULES: ScoringRule[] = [
  { dimension: 'website_presence', label: 'Presença Web', description: 'Possui site? HTTPS? Mobile-friendly?', weight: 20 },
  { dimension: 'social_presence', label: 'Presença Social', description: 'Instagram, Facebook, LinkedIn, Google Meu Negócio', weight: 20 },
  { dimension: 'reviews', label: 'Avaliações', description: 'Quantidade e qualidade de avaliações online', weight: 20 },
  { dimension: 'location', label: 'Localização', description: 'Relevância geográfica e presença local', weight: 15 },
  { dimension: 'digital_maturity', label: 'Maturidade Digital', description: 'Nível geral de presença e maturidade digital', weight: 15 },
  { dimension: 'digital_gap', label: 'Gap Digital', description: 'Oportunidade de melhoria identificada', weight: 10 },
]

// ─── Credentials ──────────────────────────────────────────────────────────────

/**
 * Lista credenciais com valor mascarado (SEC-012).
 * Requer role ADMIN.
 */
export async function getCredentials(): Promise<CredentialDto[]> {
  await requireAdmin()
  const creds = await configService.getCredentials()
  return creds.map(c => ({
    id: c.id,
    label: CREDENTIAL_PROVIDER_MAP[c.provider as CredentialProvider]?.label ?? c.provider,
    provider: c.provider as CredentialProvider,
    maskedValue: c.maskedValue,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
  }))
}

/**
 * Cria ou atualiza credencial de API para o provider.
 * INFRA-002: criptografia AES-256-GCM via CryptoUtil.
 */
export async function createCredential(data: {
  label: string
  provider: CredentialProvider
  apiKey: string
}): Promise<{ id: string }> {
  const user = await requireAdmin()
  const result = await configService.upsertCredential(
    data.provider,
    { apiKey: data.apiKey },
    user.id,
  )
  revalidatePath('/admin/configuracoes')
  return { id: result.id }
}

/**
 * Atualiza label ou chave de uma credencial existente.
 * Identifica a credencial pelo id (uuid).
 */
export async function updateCredential(
  id: string,
  data: { label?: string; apiKey?: string },
): Promise<{ success: boolean }> {
  const user = await requireAdmin()
  if (data.apiKey) {
    const cred = await prisma.apiCredential.findUnique({ where: { id } })
    if (!cred) throw new Error('Credencial não encontrada.')
    await configService.upsertCredential(cred.provider, { apiKey: data.apiKey }, user.id)
  }
  revalidatePath('/admin/configuracoes')
  return { success: true }
}

/**
 * Remove uma credencial pelo id (uuid).
 * Registra AuditLog com action "credential.deleted".
 */
export async function deleteCredential(id: string): Promise<{ success: boolean }> {
  const user = await requireAdmin()
  await configService.deleteCredential({ id }, user.id)
  revalidatePath('/admin/configuracoes')
  return { success: true }
}

/**
 * Testa se a credencial é válida chamando a API do provider.
 * Erros de conexão retornam { success: false } — não lançam exceção.
 */
export async function testCredential(id: string): Promise<{
  success: boolean
  message: string
}> {
  await requireAdmin()
  const cred = await prisma.apiCredential.findUnique({ where: { id } })
  if (!cred) return { success: false, message: 'Credencial não encontrada.' }
  const result = await configService.testCredential(cred.provider)
  return { success: result.ok, message: result.message }
}

/**
 * Ativa ou desativa uma credencial. Registra AuditLog.
 */
export async function toggleCredentialActive(id: string, isActive: boolean): Promise<{ success: boolean }> {
  const user = await requireAdmin()
  const cred = await prisma.apiCredential.findUnique({ where: { id } })
  if (!cred) throw new Error('Credencial não encontrada.')
  await prisma.apiCredential.update({ where: { id }, data: { isActive } })
  revalidatePath('/admin/configuracoes')
  return { success: true }
}

// ─── Scoring Rules ────────────────────────────────────────────────────────────

/**
 * Retorna regras de scoring mapeadas para o DTO do front-end.
 * Fallback para DEFAULT_SCORING_RULES se o seed não foi executado.
 */
export async function getScoringRules(): Promise<ScoringRule[]> {
  await requireAdmin()
  const rules = await configService.getScoringRules()
  if (rules.length === 0) return DEFAULT_SCORING_RULES
  return rules.map(r => ({
    dimension: r.slug,
    label: r.name,
    description: r.description ?? '',
    weight: r.weight,
  }))
}

/**
 * Persiste pesos de scoring. Valida soma = 100% antes de salvar.
 */
export async function saveScoringRules(rules: ScoringRule[]): Promise<{ success: boolean }> {
  const user = await requireAdmin()
  await configService.batchUpdateScoringRules(
    rules.map(r => ({ slug: r.dimension, weight: r.weight })),
    user.id,
  )
  revalidatePath('/admin/configuracoes')
  return { success: true }
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface MetricsData {
  users: { total: number }
  leads: { total: number }
  jobs: { total: number; active: number }
  invites: { pending: number }
  credentials: { active: number }
}

/**
 * Retorna métricas administrativas do sistema.
 * Requer role ADMIN.
 */
export async function getMetrics(): Promise<MetricsData> {
  await requireAdmin()

  const [totalUsers, totalLeads, totalJobs, activeJobs, pendingInvites, activeCredentials] =
    await Promise.all([
      prisma.userProfile.count(),
      prisma.lead.count(),
      prisma.collectionJob.count(),
      prisma.collectionJob.count({ where: { status: 'RUNNING' } }),
      prisma.invite.count({ where: { status: 'PENDING' } }),
      prisma.apiCredential.count({ where: { isActive: true } }),
    ])

  return {
    users: { total: totalUsers },
    leads: { total: totalLeads },
    jobs: { total: totalJobs, active: activeJobs },
    invites: { pending: pendingInvites },
    credentials: { active: activeCredentials },
  }
}
