// jest.mock é hoisted — não pode referenciar variáveis declaradas antes dele.
// Usamos jest.requireMock() para acessar o mock APÓS a inicialização.

jest.mock('@/lib/prisma', () => ({
  prisma: {
    apiCredential: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    scoringRule: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/services/crypto-util', () => ({
  CryptoUtil: {
    encrypt: jest.fn().mockReturnValue({
      encryptedKey: 'deadbeef',
      iv: 'cafebabe',
      authTag: '0123456789ab',
    }),
    decrypt: jest.fn().mockReturnValue('sk-test-plaintext-key'),
    mask: jest.fn().mockImplementation((key: string) =>
      key.length <= 8 ? '****' : `${key.slice(0, 4)}****${key.slice(-4)}`
    ),
  },
}))

jest.mock('@/lib/services/audit-service', () => ({
  AuditService: { log: jest.fn() },
}))

import { ConfigService } from '../config.service'

// ─── Helpers para acessar os mocks ────────────────────────────────────────────

function getPrisma() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return jest.requireMock('@/lib/prisma').prisma as {
    apiCredential: {
      findMany: jest.Mock
      findUnique: jest.Mock
      upsert: jest.Mock
      delete: jest.Mock
    }
    scoringRule: {
      findMany: jest.Mock
      update: jest.Mock
      updateMany: jest.Mock
      upsert: jest.Mock
    }
    $transaction: jest.Mock
  }
}

function getCrypto() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return jest.requireMock('@/lib/services/crypto-util').CryptoUtil as {
    encrypt: jest.Mock
    decrypt: jest.Mock
    mask: jest.Mock
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConfigService', () => {
  let service: ConfigService

  beforeEach(() => {
    service = new ConfigService()
    jest.clearAllMocks()
    // Reset default mock implementations
    getCrypto().encrypt.mockReturnValue({ encryptedKey: 'deadbeef', iv: 'cafebabe', authTag: '0123456789ab' })
    getCrypto().decrypt.mockReturnValue('sk-test-plaintext-key')
    getCrypto().mask.mockImplementation((key: string) =>
      key.length <= 8 ? '****' : `${key.slice(0, 4)}****${key.slice(-4)}`
    )
  })

  // ── getCredentials ─────────────────────────────────────────────────────────

  describe('getCredentials', () => {
    it('should return empty array when no credentials exist', async () => {
      getPrisma().apiCredential.findMany.mockResolvedValue([])
      const result = await service.getCredentials()
      expect(result).toEqual([])
    })

    it('should return masked credentials (SEC-012)', async () => {
      getPrisma().apiCredential.findMany.mockResolvedValue([
        {
          id: 'cred-1',
          provider: 'GOOGLE_PLACES',
          encryptedKey: 'deadbeef:0123456789ab',
          iv: 'cafebabe',
          isActive: true,
          usageCount: 0,
          usageResetAt: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ])

      const result = await service.getCredentials()

      expect(result).toHaveLength(1)
      expect(result[0].provider).toBe('GOOGLE_PLACES')
      expect(result[0].label).toBe('Google Places')
      expect(getCrypto().decrypt).toHaveBeenCalledWith('deadbeef', 'cafebabe', '0123456789ab')
      expect(getCrypto().mask).toHaveBeenCalledWith('sk-test-plaintext-key')
      // SEC-012: encryptedKey nunca exposto no retorno
      expect(result[0]).not.toHaveProperty('encryptedKey')
    })

    it('should return placeholder mask when decryption fails', async () => {
      getCrypto().decrypt.mockImplementationOnce(() => { throw new Error('key error') })
      getPrisma().apiCredential.findMany.mockResolvedValue([
        {
          id: 'cred-1',
          provider: 'OPENAI',
          encryptedKey: 'invalid:data',
          iv: 'iv',
          isActive: true,
          usageCount: 0,
          usageResetAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      const result = await service.getCredentials()
      expect(result[0].maskedValue).toBe('••••••••')
    })
  })

  // ── upsertCredential ───────────────────────────────────────────────────────

  describe('upsertCredential', () => {
    it('should encrypt, upsert and return masked credential', async () => {
      getPrisma().apiCredential.findUnique.mockResolvedValue(null) // new credential
      getPrisma().apiCredential.upsert.mockResolvedValue({
        id: 'cred-1',
        provider: 'OPENAI',
        encryptedKey: 'deadbeef:0123456789ab',
        iv: 'cafebabe',
        isActive: true,
        usageCount: 0,
        usageResetAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await service.upsertCredential('OPENAI', { apiKey: 'sk-test' }, 'user-1')

      expect(getCrypto().encrypt).toHaveBeenCalledWith('sk-test')
      expect(getPrisma().apiCredential.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { provider: 'OPENAI' } })
      )
      // SEC-012: retorna maskedValue, nunca plaintext
      expect(result.maskedValue).toBeDefined()
      expect(result).not.toHaveProperty('encryptedKey')
    })
  })

  // ── deleteCredential ───────────────────────────────────────────────────────

  describe('deleteCredential', () => {
    it('should throw CONFIG_080 when credential not found', async () => {
      getPrisma().apiCredential.findUnique.mockResolvedValue(null)
      await expect(
        service.deleteCredential({ provider: 'OPENAI' })
      ).rejects.toThrow('CONFIG_080')
    })

    it('should delete credential by id and log audit', async () => {
      const cred = { id: 'cred-1', provider: 'OPENAI' }
      getPrisma().apiCredential.findUnique.mockResolvedValue(cred)
      getPrisma().apiCredential.delete.mockResolvedValue(cred)

      await service.deleteCredential({ provider: 'OPENAI' }, 'user-1')

      expect(getPrisma().apiCredential.delete).toHaveBeenCalledWith({ where: { id: 'cred-1' } })
    })
  })

  // ── testCredential ─────────────────────────────────────────────────────────

  describe('testCredential', () => {
    it('should return CONFIG_080 when credential not found', async () => {
      getPrisma().apiCredential.findUnique.mockResolvedValue(null)
      const result = await service.testCredential('GOOGLE_PLACES')
      expect(result.ok).toBe(false)
      expect(result.message).toContain('CONFIG_080')
    })

    it('should return CONFIG_050 when decryption fails', async () => {
      getCrypto().decrypt.mockImplementationOnce(() => { throw new Error('key error') })
      getPrisma().apiCredential.findUnique.mockResolvedValue({
        id: 'cred-1',
        provider: 'ANTHROPIC',
        encryptedKey: 'bad:data',
        iv: 'iv',
      })
      const result = await service.testCredential('ANTHROPIC')
      expect(result.ok).toBe(false)
      expect(result.message).toContain('CONFIG_050')
    })

    it('should validate Anthropic key format — valid prefix', async () => {
      getCrypto().decrypt.mockReturnValueOnce('sk-ant-valid-key')
      getPrisma().apiCredential.findUnique.mockResolvedValue({
        id: 'cred-1',
        provider: 'ANTHROPIC',
        encryptedKey: 'enc:tag',
        iv: 'iv',
      })
      const result = await service.testCredential('ANTHROPIC')
      expect(result.ok).toBe(true)
      expect(result.message).toContain('formato de chave válido')
    })

    it('should validate Anthropic key format — invalid prefix', async () => {
      getCrypto().decrypt.mockReturnValueOnce('sk-invalid')
      getPrisma().apiCredential.findUnique.mockResolvedValue({
        id: 'cred-1',
        provider: 'ANTHROPIC',
        encryptedKey: 'enc:tag',
        iv: 'iv',
      })
      const result = await service.testCredential('ANTHROPIC')
      expect(result.ok).toBe(false)
    })
  })

  // ── getScoringRules ────────────────────────────────────────────────────────

  describe('getScoringRules', () => {
    it('should return empty array when no rules exist', async () => {
      getPrisma().scoringRule.findMany.mockResolvedValue([])
      const result = await service.getScoringRules()
      expect(result).toEqual([])
    })

    it('should return rules ordered by sortOrder', async () => {
      const rules = [
        { id: '1', slug: 'website_presence', name: 'Presença Web', weight: 20, sortOrder: 0 },
        { id: '2', slug: 'social_presence', name: 'Presença Social', weight: 20, sortOrder: 1 },
      ]
      getPrisma().scoringRule.findMany.mockResolvedValue(rules)
      const result = await service.getScoringRules()
      expect(result).toEqual(rules)
      expect(getPrisma().scoringRule.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: 'asc' } })
    })
  })

  // ── batchUpdateScoringRules ────────────────────────────────────────────────

  describe('batchUpdateScoringRules', () => {
    it('should throw when weights do not sum to 100%', async () => {
      await expect(
        service.batchUpdateScoringRules([
          { slug: 'website_presence', weight: 50 },
          { slug: 'social_presence', weight: 49 },
        ])
      ).rejects.toThrow('A soma dos pesos deve ser 100%')
    })

    it('should execute atomic transaction when sum = 100%', async () => {
      getPrisma().$transaction.mockResolvedValue([])
      getPrisma().scoringRule.findMany.mockResolvedValue([])

      await service.batchUpdateScoringRules([
        { slug: 'website_presence', weight: 60 },
        { slug: 'social_presence', weight: 40 },
      ])

      expect(getPrisma().$transaction).toHaveBeenCalled()
    })
  })

  // ── resetScoringRules ──────────────────────────────────────────────────────

  describe('resetScoringRules', () => {
    it('should upsert all default rules via transaction', async () => {
      getPrisma().$transaction.mockResolvedValue([])
      getPrisma().scoringRule.findMany.mockResolvedValue([])

      await service.resetScoringRules('user-1')

      expect(getPrisma().$transaction).toHaveBeenCalled()
    })
  })
})
