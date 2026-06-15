import { toE164, isMobileBR, classifyPhone, buildWaMeLink, buildTelLink, formatPhoneDisplay } from '../phone-utils'

describe('phone-utils', () => {
  describe('toE164', () => {
    it('normaliza móvel BR com formatação', () => {
      expect(toE164('+55 12 99123-4567')).toBe('5512991234567')
      expect(toE164('(12) 99123-4567')).toBe('5512991234567')
    })
    it('normaliza fixo BR', () => {
      expect(toE164('+55 12 3145-2031')).toBe('551231452031')
      expect(toE164('12 3145-2031')).toBe('551231452031')
    })
    it('remove tronco 0 e prefixo internacional', () => {
      expect(toE164('011 99123-4567')).toBe('5511991234567')
      expect(toE164('0055 12 99123-4567')).toBe('5512991234567')
    })
    it('retorna null para lixo', () => {
      expect(toE164('')).toBeNull()
      expect(toE164(null)).toBeNull()
      expect(toE164('123')).toBeNull()
    })
  })

  describe('isMobileBR', () => {
    it('detecta celular (9 dígitos começando em 9)', () => {
      expect(isMobileBR('5512991234567')).toBe(true)
    })
    it('rejeita fixo (8 dígitos)', () => {
      expect(isMobileBR('551231452031')).toBe(false)
    })
    it('rejeita não-BR e null', () => {
      expect(isMobileBR('14155552671')).toBe(false)
      expect(isMobileBR(null)).toBe(false)
    })
  })

  describe('classifyPhone', () => {
    it('classifica móvel e fixo', () => {
      expect(classifyPhone('+55 12 99123-4567')).toEqual({ e164: '5512991234567', isMobile: true })
      expect(classifyPhone('+55 12 3145-2031')).toEqual({ e164: '551231452031', isMobile: false })
    })
  })

  describe('links', () => {
    it('wa.me só para móvel, com texto encodado', () => {
      expect(buildWaMeLink('+55 12 99123-4567', 'oi, tudo bem?')).toBe('https://wa.me/5512991234567?text=oi%2C%20tudo%20bem%3F')
      expect(buildWaMeLink('+55 12 3145-2031', 'oi')).toBeNull() // fixo
    })
    it('tel: para qualquer número válido', () => {
      expect(buildTelLink('+55 12 3145-2031')).toBe('tel:+551231452031')
      expect(buildTelLink('xx')).toBeNull()
    })
  })

  describe('formatPhoneDisplay', () => {
    it('formata móvel e fixo BR', () => {
      expect(formatPhoneDisplay('5512991234567')).toBe('+55 (12) 99123-4567')
      expect(formatPhoneDisplay('551231452031')).toBe('+55 (12) 3145-2031')
    })
  })
})
