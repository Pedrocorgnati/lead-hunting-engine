import { prisma } from '@/lib/prisma'
import { CryptoUtil } from '@/lib/services/crypto-util'
import { AuditService } from '@/lib/services/audit-service'
import type { UpsertCredentialInput, UpdateScoringRuleInput } from '@/schemas/config.schema'
import type { ScoringRule } from '@prisma/client'

// ─── ApiCredential DTO ───────────────────────────────────────────────────────

export interface ApiCredentialSafe {
  id: string
  provider: string
  label: string
  maskedValue: string // SEC-012: plaintext NUNCA exposto
  isActive: boolean
  usageCount: number
  usageResetAt: Date | null
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
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    }
  }

  /**
   * Remove uma credencial. Aceita id (uuid) ou provider como chave.
   * SEC-011: delete via PK — sem service_role desnecessário.
   */
  async deleteCredential(
    where: { id?: string; provider?: string },
    userId?: string,
    ipAddress?: string,
  ): Promise<void> {
    const credential = await prisma.apiCredential.findUnique({
      where: where.id ? { id: where.id } : { provider: where.provider! },
    })
    if (!credential) throw new Error('CONFIG_080: Credencial de API não encontrada.')

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

    try {
      switch (provider) {
        case 'GOOGLE_PLACES': {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${apiKey}`
          )
          const data = (await res.json()) as { status: string }
          const ok = data.status !== 'REQUEST_DENIED'
          return { ok, message: ok ? 'Google Places: chave válida' : `Google Places: ${data.status}` }
        }
        case 'OUTSCRAPER': {
          const res = await fetch('https://api.outscraper.com/me', {
            headers: { 'X-API-KEY': apiKey },
          })
          return { ok: res.ok, message: res.ok ? 'Outscraper: conta válida' : `Outscraper: ${res.status}` }
        }
        case 'APIFY': {
          const res = await fetch('https://api.apify.com/v2/users/me', {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
          return { ok: res.ok, message: res.ok ? 'Apify: conta válida' : `Apify: ${res.status}` }
        }
        case 'OPENAI': {
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
          return { ok: res.ok, message: res.ok ? 'OpenAI: chave válida' : `OpenAI: ${res.status}` }
        }
        case 'ANTHROPIC': {
          const ok = apiKey.startsWith('sk-ant-')
          return { ok, message: ok ? 'Anthropic: formato de chave válido' : 'Anthropic: formato inválido' }
        }
        case 'HERE_MAPS': {
          const res = await fetch(`https://geocode.search.hereapi.com/v1/geocode?q=test&apiKey=${apiKey}`)
          return { ok: res.ok, message: res.ok ? 'HERE Maps: chave válida' : `HERE Maps: ${res.status}` }
        }
        case 'TOMTOM': {
          const res = await fetch(`https://api.tomtom.com/search/2/search/test.json?key=${apiKey}`)
          return { ok: res.ok, message: res.ok ? 'TomTom: chave válida' : `TomTom: ${res.status}` }
        }
        case 'CUSTOM':
        default: {
          const ok = apiKey.length > 10
          return { ok, message: ok ? 'Credencial parece válida (teste básico)' : 'Credencial muito curta' }
        }
      }
    } catch (e) {
      return { ok: false, message: `Erro de conexão: ${(e as Error).message}` }
    }
  }

  // ── Scoring Rules ────────────────────────────────────────────────────────────

  async getScoringRules(): Promise<ScoringRule[]> {
    return prisma.scoringRule.findMany({ orderBy: { sortOrder: 'asc' } })
  }

  async updateScoringRule(ruleId: string, data: UpdateScoringRuleInput): Promise<ScoringRule> {
    return prisma.scoringRule.update({
      where: { id: ruleId },
      // condition é Record<string,unknown> — cast necessário para Prisma InputJsonValue
      data: { ...data, condition: data.condition as never },
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
    const DEFAULT_RULES = [
      { slug: 'website_presence', name: 'Presença Web', description: 'Possui site? HTTPS? Mobile-friendly?', weight: 20, isActive: true as const, condition: {}, sortOrder: 0 },
      { slug: 'social_presence', name: 'Presença Social', description: 'Instagram, Facebook, LinkedIn, Google Meu Negócio', weight: 20, isActive: true as const, condition: {}, sortOrder: 1 },
      { slug: 'reviews', name: 'Avaliações', description: 'Quantidade e qualidade de avaliações online', weight: 20, isActive: true as const, condition: {}, sortOrder: 2 },
      { slug: 'location', name: 'Localização', description: 'Relevância geográfica e presença local', weight: 15, isActive: true as const, condition: {}, sortOrder: 3 },
      { slug: 'digital_maturity', name: 'Maturidade Digital', description: 'Nível geral de presença e maturidade digital', weight: 15, isActive: true as const, condition: {}, sortOrder: 4 },
      { slug: 'digital_gap', name: 'Gap Digital', description: 'Oportunidade de melhoria identificada', weight: 10, isActive: true as const, condition: {}, sortOrder: 5 },
    ]

    await prisma.$transaction(
      DEFAULT_RULES.map(rule =>
        prisma.scoringRule.upsert({
          where: { slug: rule.slug },
          create: rule,
          update: { description: rule.description },
        })
      )
    )

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
