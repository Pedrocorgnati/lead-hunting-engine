import { ConfigService } from '../config.service'

describe('ConfigService', () => {
  let service: ConfigService

  beforeEach(() => {
    service = new ConfigService()
  })

  describe('getCredentials', () => {
    it('should return empty array (stub)', async () => {
      const result = await service.getCredentials()
      expect(result).toEqual([])
    })
  })

  describe('getScoringRules', () => {
    it('should return empty array (stub)', async () => {
      const result = await service.getScoringRules()
      expect(result).toEqual([])
    })
  })

  describe('upsertCredential', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(
        service.upsertCredential('GOOGLE_PLACES', { apiKey: 'test-key' })
      ).rejects.toThrow('Not implemented')
    })
  })

  describe('resetScoringRules', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(service.resetScoringRules()).rejects.toThrow('Not implemented')
    })
  })
})
