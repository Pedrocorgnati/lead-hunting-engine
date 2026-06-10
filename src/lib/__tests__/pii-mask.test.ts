import { maskEmail, maskCpf, maskPhone, maskName, maskFreeText, maskPiiDeep } from '../pii-mask'

describe('pii-mask', () => {
  describe('maskEmail', () => {
    it('mascara mantendo primeira letra e dominio', () => {
      expect(maskEmail('joao@gmail.com')).toBe('j***@gmail.com')
    })

    it('mascara emails embutidos em texto livre', () => {
      expect(maskEmail('contato: maria.silva@empresa.com.br ok')).toBe('contato: m***@empresa.com.br ok')
    })
  })

  describe('maskCpf', () => {
    it('mascara CPF com pontuacao preservando 2 ultimos digitos', () => {
      expect(maskCpf('123.456.789-09')).toBe('***.***.***-09')
    })

    it('mascara CPF sem pontuacao', () => {
      expect(maskCpf('12345678909')).toBe('***.***.***-09')
    })
  })

  describe('maskPhone', () => {
    it('mascara celular 11 digitos preservando DDD e sufixo', () => {
      expect(maskPhone('(11) 98765-4321')).toBe('(11) ****-4321')
    })

    it('mascara fixo 10 digitos', () => {
      expect(maskPhone('1133334444')).toBe('(11) ****-4444')
    })
  })

  describe('maskName', () => {
    it('preserva primeiro nome e abrevia o resto', () => {
      expect(maskName('Maria Aparecida Silva')).toBe('Maria A. S.')
    })

    it('nome unico permanece intacto', () => {
      expect(maskName('Maria')).toBe('Maria')
    })
  })

  describe('maskFreeText', () => {
    it('mascara email, cpf e telefone no mesmo texto', () => {
      const masked = maskFreeText('joao@x.com cpf 123.456.789-09 tel (11) 98765-4321')
      expect(masked).toContain('j***@x.com')
      expect(masked).toContain('***.***.***-09')
      expect(masked).toContain('(11) ****-4321')
    })
  })

  describe('maskPiiDeep', () => {
    it('mascara strings aninhadas em objetos e arrays', () => {
      const result = maskPiiDeep({
        errors: [{ message: 'lead joao@x.com rejeitado' }],
        contactName: 'Maria Aparecida Silva',
        total: 2,
        nested: { phone: '(11) 98765-4321' },
      }) as Record<string, unknown>

      expect((result.errors as Array<{ message: string }>)[0].message).toContain('j***@x.com')
      expect(result.contactName).toBe('Maria A. S.')
      expect(result.total).toBe(2)
      expect((result.nested as { phone: string }).phone).toBe('(11) ****-4321')
    })

    it('preserva null, boolean e numeros', () => {
      expect(maskPiiDeep(null)).toBeNull()
      expect(maskPiiDeep(42)).toBe(42)
      expect(maskPiiDeep(true)).toBe(true)
    })
  })
})
