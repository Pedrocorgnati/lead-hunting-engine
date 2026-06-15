import {
  classifyBRPhone,
  isMobileBR,
  VALID_BR_DDDS,
} from '../enrichers/phone-classifier'

describe('classifyBRPhone', () => {
  describe('celular (mobile)', () => {
    it('classifica celular de 11 digitos com +55 (formato phoneNormalized)', () => {
      expect(classifyBRPhone('+5511999998888')).toBe('mobile')
    })

    it('classifica celular de 13 digitos sem o + (55 + DDD + 9 digitos)', () => {
      expect(classifyBRPhone('5511999998888')).toBe('mobile')
    })

    it('classifica celular de 11 digitos sem codigo do pais', () => {
      expect(classifyBRPhone('11999998888')).toBe('mobile')
    })

    it('classifica celular formatado com parenteses e hifen', () => {
      expect(classifyBRPhone('(11) 99999-8888')).toBe('mobile')
    })

    it('remove o 0 de tronco inicial (discagem nacional)', () => {
      expect(classifyBRPhone('011999998888')).toBe('mobile')
    })

    it('classifica celular do DDD 55 com codigo do pais (55 duplicado)', () => {
      expect(classifyBRPhone('+5555999998888')).toBe('mobile')
    })
  })

  describe('fixo (fixed)', () => {
    it('classifica fixo de 10 digitos cru (normalizePhone NAO normaliza fixos)', () => {
      expect(classifyBRPhone('1133334444')).toBe('fixed')
    })

    it('classifica fixo formatado', () => {
      expect(classifyBRPhone('(11) 3333-4444')).toBe('fixed')
    })

    it('classifica fixo com codigo do pais (12 digitos)', () => {
      expect(classifyBRPhone('+551133334444')).toBe('fixed')
    })

    it('classifica fixo iniciando em 2 e em 5', () => {
      expect(classifyBRPhone('2122223333')).toBe('fixed')
      expect(classifyBRPhone('2155554444')).toBe('fixed')
    })
  })

  describe('unknown (fail-closed)', () => {
    it('celular legado de 8 digitos (sem o nono digito) e unknown', () => {
      expect(classifyBRPhone('1199998888')).toBe('unknown')
      expect(classifyBRPhone('+551199998888')).toBe('unknown')
    })

    it('DDD inexistente (23, 25, 26) e unknown', () => {
      expect(classifyBRPhone('23999998888')).toBe('unknown')
      expect(classifyBRPhone('25999998888')).toBe('unknown')
      expect(classifyBRPhone('26999998888')).toBe('unknown')
    })

    it('numero internacional nao-BR e unknown', () => {
      // EUA: 11 digitos mas assinante nao casa com o padrao BR.
      expect(classifyBRPhone('+14155552671')).toBe('unknown')
      // Alemanha: 13 digitos sem prefixo 55.
      expect(classifyBRPhone('+4915123456789')).toBe('unknown')
    })

    it('comprimento fora do padrao e unknown', () => {
      expect(classifyBRPhone('119999')).toBe('unknown')
      expect(classifyBRPhone('551199999988887777')).toBe('unknown')
    })

    it('assinante de 9 digitos que nao comeca em 9 e unknown', () => {
      expect(classifyBRPhone('11899998888')).toBe('unknown')
    })

    it('fixo de 8 digitos iniciando fora de 2-5 e unknown', () => {
      expect(classifyBRPhone('1163334444')).toBe('unknown')
    })

    it('entrada nula, vazia ou nao numerica e unknown', () => {
      expect(classifyBRPhone(null)).toBe('unknown')
      expect(classifyBRPhone(undefined)).toBe('unknown')
      expect(classifyBRPhone('')).toBe('unknown')
      expect(classifyBRPhone('abc')).toBe('unknown')
    })
  })
})

describe('isMobileBR', () => {
  it('true somente para mobile', () => {
    expect(isMobileBR('+5511999998888')).toBe(true)
    expect(isMobileBR('1133334444')).toBe(false)
    expect(isMobileBR('1199998888')).toBe(false)
    expect(isMobileBR(null)).toBe(false)
  })
})

describe('VALID_BR_DDDS', () => {
  it('contem 67 DDDs e exclui os inexistentes', () => {
    expect(VALID_BR_DDDS.size).toBe(67)
    expect(VALID_BR_DDDS.has('11')).toBe(true)
    expect(VALID_BR_DDDS.has('99')).toBe(true)
    expect(VALID_BR_DDDS.has('23')).toBe(false)
    expect(VALID_BR_DDDS.has('25')).toBe(false)
    expect(VALID_BR_DDDS.has('26')).toBe(false)
    expect(VALID_BR_DDDS.has('10')).toBe(false)
  })
})
