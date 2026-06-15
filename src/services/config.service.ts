import { prisma } from '@/lib/prisma'
import { CryptoUtil } from '@/lib/services/crypto-util'
import { maskUrlSecrets } from '@/lib/observability/mask-url'
import { AuditService } from '@/lib/services/audit-service'
import type { UpsertCredentialInput, UpdateScoringRuleInput } from '@/schemas/config.schema'
import type { ScoringRule } from '@prisma/client'
import { CollectionJobStatus, DataSource } from '@/lib/constants/enums'
import {
  DEFAULT_SCORING_RULES as CANONICAL_DEFAULTS,
  DEPRECATED_SCORING_SLUGS,
} from '@/lib/scoring/default-rules'

// Mapeia CredentialProvider -> DataSource correspondente usada por CollectionJob.
// Usado pelo safeguard de DELETE para bloquear remoção enquanto há jobs ativos
// consumindo a credencial.
const PROVIDER_TO_DATA_SOURCES: Record<string, DataSource[]> = {
  GOOGLE_PLACES: [DataSource.GOOGLE_MAPS],
  OUTSCRAPER: [DataSource.OUTSCRAPER],
  APIFY: [DataSource.APIFY],
  HERE_MAPS: [DataSource.HERE_PLACES],
  TOMTOM: [DataSource.TOMTOM],
  KIMI: [],
  OPENAI: [],
  ANTHROPIC: [],
}

// ─── ApiCredential DTO ───────────────────────────────────────────────────────

export interface ApiCredentialSafe {
  id: string
  provider: string
  label: string
  maskedValue: string // SEC-012: plaintext NUNCA exposto
  isActive: boolean
  usageCount: number
  usageResetAt: Date | null
  cost: number | null
  auditSummary: string | null
  lastValidatedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// ─── Helpers de criptografia ──────────────────────────────────────────────────
// O schema Prisma armazena encryptedKey + iv, mas AES-256-GCM também produz um
// authTag. Empacotamos como "${encryptedKey}:${authTag}" no campo encryptedKey.
// Hex strings só contêm [0-9a-f], portanto ":" é um delimitador seguro.

function packEncrypted(result: { encryptedKey: string; authTag: string }): string {
  return `${result.encryptedKey}:${result.authTag}`
}

function unpackEncrypted(packed: string): { encryptedKey: string; authTag: string } {
  const idx = packed.lastIndexOf(':')
  return {
    encryptedKey: packed.slice(0, idx),
    authTag: packed.slice(idx + 1),
  }
}

// ─── Provider label map ───────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_PLACES: 'Google Places',
  OUTSCRAPER: 'Outscraper',
  APIFY: 'Apify',
  KIMI: 'Kimi',
  OPENAI: 'OpenAI',
  ANTHROPIC: 'Anthropic',
}

function getProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}

// ─── ConfigService ────────────────────────────────────────────────────────────

export class ConfigService {
  // ── Credentials ─────────────────────────────────────────────────────────────

  /**
   * Lista todas as credenciais com valor mascarado.
   * SEC-012: encryptedValue NUNCA retornado; somente maskedValue.
   */
  async getCredentials(): Promise<ApiCredentialSafe[]> {
    const creds = await prisma.apiCredential.findMany({
      orderBy: { provider: 'asc' },
    })

    return creds.map(c => {
      let maskedValue = '••••••••'
      try {
        const { encryptedKey, authTag } = unpackEncrypted(c.encryptedKey)
        const plaintext = CryptoUtil.decrypt(encryptedKey, c.iv, authTag)
        maskedValue = CryptoUtil.mask(plaintext)
      } catch {
        // ENCRYPTION_KEY ausente ou valor corrompido — retorna placeholder seguro
      }
      return {
        id: c.id,
        provider: c.provider,
        label: getProviderLabel(c.provider),
        maskedValue,
        isActive: c.isActive,
        usageCount: c.usageCount,
        usageResetAt: c.usageResetAt,
        cost: c.cost,
        auditSummary: c.auditSummary,
        lastValidatedAt: c.lastValidatedAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }
    })
  }

  /**
   * Cria ou atualiza uma credencial (upsert por provider).
   * INFRA-002: CryptoUtil.encrypt() valida ENCRYPTION_KEY no startup.
   * SEC-012: retorna maskedValue, nunca plaintext.
   */
  async upsertCredential(
    provider: string,
    data: UpsertCredentialInput,
    userId?: string,
    ipAddress?: string,
  ): Promise<ApiCredentialSafe> {
    // INFRA-002: lança se ENCRYPTION_KEY inválida/ausente
    const encrypted = CryptoUtil.encrypt(data.apiKey)
    const packedKey = packEncrypted(encrypted)

    // Detectar create vs update para audit log
    const existing = await prisma.apiCredential.findUnique({ where: { provider } })

    const credential = await prisma.apiCredential.upsert({
      where: { provider },
      create: { provider, encryptedKey: packedKey, iv: encrypted.iv, isActive: true },
      update: { encryptedKey: packedKey, iv: encrypted.iv, isActive: true },
    })

    await AuditService.log({
      userId,
      action: existing ? 'credential.updated' : 'credential.created',
      resource: 'api_credentials',
      resourceId: credential.id,
      metadata: { provider },
      ipAddress,
    })

    return {
      id: credential.id,
      provider: credential.provider,
      label: getProviderLabel(credential.provider),
      maskedValue: CryptoUtil.mask(data.apiKey), // SEC-012
      isActive: credential.isActive,
      usageCount: credential.usageCount,
      usageResetAt: credential.usageResetAt,
      cost: credential.cost,
      auditSummary: credential.auditSummary,
      lastValidatedAt: credential.lastValidatedAt,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    }
  }

  /**
   * Remove uma credencial. Aceita id (uuid) ou provider como chave.
   * SEC-011: delete via PK — sem service_role desnecessário.
   */
  /**
   * Verifica se há CollectionJob ativo (QUEUED/RUNNING) consumindo o provider.
   * Retorna a lista de jobs bloqueantes (vazia quando seguro deletar).
   */
  async getActiveJobsUsingProvider(provider: string): Promise<Array<{ id: string; name: string | null; status: string; userId: string }>> {
    const sources = PROVIDER_TO_DATA_SOURCES[provider]
    if (!sources || sources.length === 0) return []

    const jobs = await prisma.collectionJob.findMany({
      where: {
        status: { in: [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING] },
        sources: { hasSome: sources },
      },
      select: { id: true, name: true, status: true, userId: true },
      take: 50,
    })
    return jobs
  }

  async deleteCredential(
    where: { id?: string; provider?: string },
    userId?: string,
    ipAddress?: string,
  ): Promise<void> {
    const credential = await prisma.apiCredential.findUnique({
      where: where.id ? { id: where.id } : { provider: where.provider! },
    })
    if (!credential) {
      const err = Object.assign(new Error('Credencial de API não encontrada.'), {
        code: 'CONFIG_080',
        httpStatus: 404,
      })
      throw err
    }

    // Safeguard (CL-206): bloquear se há job ativo consumindo a credencial.
    const activeJobs = await this.getActiveJobsUsingProvider(credential.provider)
    if (activeJobs.length > 0) {
      const err = Object.assign(
        new Error(
          `Não é possível remover esta credencial: ${activeJobs.length} job(s) ativo(s) dependem dela.`
        ),
        {
          code: 'CONFIG_082',
          httpStatus: 409,
          details: { activeJobs },
        }
      )
      throw err
    }

    await prisma.apiCredential.delete({ where: { id: credential.id } })

    await AuditService.log({
      userId,
      action: 'credential.deleted',
      resource: 'api_credentials',
      resourceId: credential.id,
      metadata: { provider: credential.provider },
      ipAddress,
    })
  }

  /**
   * Testa se uma credencial é válida chamando o endpoint do provider.
   * Erros de conexão são tratados como resultado de teste (não 500).
   */
  async testCredential(provider: string): Promise<{ ok: boolean; message: string }> {
    const credential = await prisma.apiCredential.findUnique({ where: { provider } })
    if (!credential) return { ok: false, message: 'CONFIG_080: Credencial não encontrada.' }

    let apiKey: string
    try {
      const { encryptedKey, authTag } = unpackEncrypted(credential.encryptedKey)
      apiKey = CryptoUtil.decrypt(encryptedKey, credential.iv, authTag)
    } catch {
      return { ok: false, message: 'CONFIG_050: Não foi possível descriptografar a credencial.' }
    }

    let result: { ok: boolean; message: string }
    try {
      switch (provider) {
        case 'GOOGLE_PLACES': {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${apiKey}`
          )
          const data = (await res.json()) as { status: string }
          const ok = data.status !== 'REQUEST_DENIED'
          result = { ok, message: ok ? 'Google Places: chave válida' : `Google Places: ${data.status}` }
          break
        }
        case 'OUTSCRAPER': {
          const res = await fetch('https://api.outscraper.com/me', {
            headers: { 'X-API-KEY': apiKey },
          })
          result = { ok: res.ok, message: res.ok ? 'Outscraper: conta válida' : `Outscraper: ${res.status}` }
          break
        }
        case 'APIFY': {
          const res = await fetch('https://api.apify.com/v2/users/me', {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
          result = { ok: res.ok, message: res.ok ? 'Apify: conta válida' : `Apify: ${res.status}` }
          break
        }
        case 'OPENAI': {
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
          result = { ok: res.ok, message: res.ok ? 'OpenAI: chave válida' : `OpenAI: ${res.status}` }
          break
        }
        case 'KIMI': {
          const res = await fetch('https://api.moonshot.ai/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
          result = { ok: res.ok, message: res.ok ? 'Kimi: chave valida' : `Kimi: ${res.status}` }
          break
        }
        case 'ANTHROPIC': {
          // Live test: chamada minima ao endpoint /v1/models (GET).
          // Anthropic retorna 200 com lista de modelos em chave valida; 401 em invalida.
          const res = await fetch('https://api.anthropic.com/v1/models', {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
          })
          result = {
            ok: res.ok,
            message: res.ok
              ? 'Anthropic: chave valida'
              : `Anthropic: ${res.status} ${res.statusText || 'invalida'}`,
          }
          break
        }
        case 'HERE_MAPS': {
          const res = await fetch(`https://geocode.search.hereapi.com/v1/geocode?q=test&apiKey=${apiKey}`)
          result = { ok: res.ok, message: res.ok ? 'HERE Maps: chave válida' : `HERE Maps: ${res.status}` }
          break
        }
        case 'TOMTOM': {
          const res = await fetch(`https://api.tomtom.com/search/2/search/test.json?key=${apiKey}`)
          result = { ok: res.ok, message: res.ok ? 'TomTom: chave válida' : `TomTom: ${res.status}` }
          break
        }
        case 'CUSTOM':
        default: {
          const ok = apiKey.length > 10
          result = { ok, message: ok ? 'Credencial parece válida (teste básico)' : 'Credencial muito curta' }
          break
        }
      }
    } catch (e) {
      // H-01: a mensagem e persistida em auditSummary; mascarar para nao gravar
      // key/apiKey que a API exige em query string (Google/HERE/TomTom).
      result = { ok: false, message: maskUrlSecrets(`Erro de conexão: ${(e as Error).message}`) }
    }

    await prisma.apiCredential.update({
      where: { provider },
      data: {
        lastValidatedAt: new Date(),
        auditSummary: result.message.slice(0, 500),
      },
    })

    return result
  }

  // ── Scoring Rules ────────────────────────────────────────────────────────────

  async getScoringRules(): Promise<ScoringRule[]> {
    return prisma.scoringRule.findMany({ orderBy: { sortOrder: 'asc' } })
  }

  async updateScoringRule(
    ruleId: string,
    data: UpdateScoringRuleInput,
    // outreach-engine (06-10, task 23/F-06): experimentId rastreia ajuste de
    // peso por campanha/fonte — permite medir impacto do experimento.
    opts?: { changedBy?: string; changeReason?: string; experimentId?: string },
  ): Promise<ScoringRule> {
    return prisma.$transaction(async (tx) => {
      const previous = await tx.scoringRule.findUnique({ where: { id: ruleId } })
      if (previous) {
        await tx.scoringRuleHistory.create({
          data: {
            ruleId,
            snapshot: previous as never,
            changedBy: opts?.changedBy ?? null,
            changeReason: opts?.changeReason ?? null,
            experimentId: opts?.experimentId ?? null,
          },
        })
      }
      return tx.scoringRule.update({
        where: { id: ruleId },
        // condition é Record<string,unknown> — cast necessário para Prisma InputJsonValue
        data: { ...data, condition: data.condition as never },
      })
    })
  }

  /**
   * outreach-engine (06-10, task 23/F-06): impacto de um experimento de
   * scoring. Lista as mudancas de peso atribuidas ao experimentId (rastreaveis
   * por ID) com snapshot antes/depois — base para medir o efeito por campanha.
   */
  async getScoringExperimentImpact(experimentId: string) {
    return prisma.scoringRuleHistory.findMany({
      where: { experimentId },
      orderBy: { createdAt: 'desc' },
      include: { rule: { select: { slug: true, name: true, weight: true } } },
    })
  }

  async listScoringRuleHistory(ruleId: string) {
    return prisma.scoringRuleHistory.findMany({
      where: { ruleId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  }

  /**
   * Atualiza pesos de múltiplas regras em transação atômica.
   * Valida que a soma é 100% antes de persistir.
   */
  async batchUpdateScoringRules(
    updates: Array<{ slug: string; weight: number }>,
    userId?: string,
    ipAddress?: string,
  ): Promise<ScoringRule[]> {
    const total = updates.reduce((sum, r) => sum + r.weight, 0)
    if (Math.abs(total - 100) > 0.01) {
      throw new Error('A soma dos pesos deve ser 100%')
    }

    await prisma.$transaction(
      updates.map(({ slug, weight }) =>
        prisma.scoringRule.updateMany({ where: { slug }, data: { weight } })
      )
    )

    await AuditService.log({
      userId,
      action: 'scoring_rule.updated',
      resource: 'scoring_rules',
      metadata: { updatedCount: String(updates.length) },
      ipAddress,
    })

    return this.getScoringRules()
  }

  /**
   * Restaura regras de scoring para os valores padrão (upsert idempotente).
   * Preserva pesos customizados — update só reseta description.
   */
  async resetScoringRules(userId?: string): Promise<ScoringRule[]> {
    const DEFAULT_RULES = CANONICAL_DEFAULTS.map((rule, index) => ({
      slug: rule.slug,
      name: rule.name,
      description: rule.description,
      weight: rule.weight,
      isActive: rule.isActive,
      condition: rule.condition as object,
      sortOrder: index,
    }))

    await prisma.$transaction([
      // Remove slugs legados deprecados (ex.: renomeados para alinhar com engine).
      prisma.scoringRule.deleteMany({
        where: { slug: { in: [...DEPRECATED_SCORING_SLUGS] } },
      }),
      ...DEFAULT_RULES.map(rule =>
        prisma.scoringRule.upsert({
          where: { slug: rule.slug },
          create: rule,
          update: {
            // Reset canônico: restaura pesos, descrição e sortOrder aos defaults.
            weight: rule.weight,
            description: rule.description,
            sortOrder: rule.sortOrder,
          },
        })
      ),
    ])

    await AuditService.log({
      userId,
      action: 'scoring_rule.reset',
      resource: 'scoring_rules',
      metadata: {},
    })

    return this.getScoringRules()
  }
}

export const configService = new ConfigService()
