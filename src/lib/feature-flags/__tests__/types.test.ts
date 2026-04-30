import { describe, expect, it } from '@jest/globals'
import { parseFeatureFlagName, unsafeFeatureFlagName, SUPPORTED_ENVS } from '../types'

describe('feature-flags/types', () => {
  describe('parseFeatureFlagName', () => {
    it.each([
      'fase2.outreach.whatsapp_enabled',
      'system.healthcheck.echo',
      'fase2.billing.stripe_checkout',
      'experimental.dashboard.kpi_widget_v2',
    ])('aceita formato canonico %s', (name) => {
      expect(parseFeatureFlagName(name)).toBe(name)
    })

    it.each([
      'outreach-whatsapp-enabled',
      'fase2.OutreachWhatsapp',
      'fase2.outreach',
      'fase2.outreach.whatsapp.enabled',
      'fase2.outreach.x',
      '',
      'FASE2.OUTREACH.WHATSAPP_ENABLED',
    ])('rejeita formato invalido "%s"', (name) => {
      expect(() => parseFeatureFlagName(name)).toThrow()
    })
  })

  describe('unsafeFeatureFlagName', () => {
    it('atribui o brand sem validar', () => {
      // Caso de uso: input ja validado por Zod no route handler.
      const name = unsafeFeatureFlagName('qualquer.coisa.aqui')
      expect(typeof name).toBe('string')
      expect(name).toBe('qualquer.coisa.aqui')
    })
  })

  describe('SUPPORTED_ENVS', () => {
    it('contem os 3 ambientes canonicos', () => {
      expect([...SUPPORTED_ENVS]).toEqual(['development', 'preview', 'production'])
    })
  })
})
