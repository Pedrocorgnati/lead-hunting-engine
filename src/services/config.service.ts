import type { UpsertCredentialInput, UpdateScoringRuleInput } from '@/schemas/config.schema'
import type { ApiCredential, ScoringRule } from '@prisma/client'

export interface ApiCredentialSafe {
  id: string
  provider: string
  isActive: boolean
  usageCount: number
  usageResetAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export class ConfigService {
  async getCredentials(): Promise<ApiCredentialSafe[]> {
    // TODO: Implementar via /auto-flow execute
    return []
  }

  async upsertCredential(provider: string, data: UpsertCredentialInput): Promise<ApiCredentialSafe> {
    // TODO: Implementar via /auto-flow execute
    void provider
    void data
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async deleteCredential(provider: string): Promise<void> {
    // TODO: Implementar via /auto-flow execute
    void provider
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async getScoringRules(): Promise<ScoringRule[]> {
    // TODO: Implementar via /auto-flow execute
    return []
  }

  async updateScoringRule(ruleId: string, data: UpdateScoringRuleInput): Promise<ScoringRule> {
    // TODO: Implementar via /auto-flow execute
    void ruleId
    void data
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async resetScoringRules(): Promise<ScoringRule[]> {
    // TODO: Implementar via /auto-flow execute
    throw new Error('Not implemented - run /auto-flow execute')
  }
}

export const configService = new ConfigService()
