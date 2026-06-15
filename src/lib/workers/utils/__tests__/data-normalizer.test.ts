import {
  normalizeRawLead,
  normalizePhone,
  normalizePhoneE164,
  normalizeUrl,
  sanitizeRawJson,
} from '../data-normalizer'

describe('normalizePhone', () => {
  it('formata telefone BR 11 dígitos com +55', () => {
    expect(normalizePhone('11987654321')).toBe('+5511987654321')
  })

  it('preserva telefone já com +55 (13 dígitos)', () => {
    expect(normalizePhone('5511987654321')).toBe('+5511987654321')
  })

  it('retorna null para input null/undefined', () => {
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })

  it('preserva formatos não reconhecidos sem alterar', () => {
    // 9 digits — does not match BR 11-digit or 13-digit pattern
    expect(normalizePhone('+1-555-1234')).toBe('+1-555-1234')
  })

  it('faz trim de espaços', () => {
    expect(normalizePhone('  +5511999999999  ')).toBe('+5511999999999')
  })
})

describe('normalizePhoneE164 (R3-2 — contrato da coluna phone_normalized)', () => {
  it('normaliza fixo BR de 10 digitos (caso que normalizePhone deixava cru)', () => {
    expect(normalizePhoneE164('(11) 3333-4444')).toBe('+551133334444')
    expect(normalizePhone('(11) 3333-4444')).toBe('(11) 3333-4444') // o gap original
  })

  it('normaliza celular BR de 11 digitos e preserva +55 existente', () => {
    expect(normalizePhoneE164('11987654321')).toBe('+5511987654321')
    expect(normalizePhoneE164('+55 (11) 98765-4321')).toBe('+5511987654321')
  })

  it('retorna null para input nulo ou implausivel', () => {
    expect(normalizePhoneE164(null)).toBeNull()
    expect(normalizePhoneE164(undefined)).toBeNull()
    expect(normalizePhoneE164('123')).toBeNull()
  })
})

describe('normalizeUrl', () => {
  it('adiciona https:// quando ausente', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com')
  })

  it('preserva http://', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com')
  })

  it('preserva https://', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com')
  })

  it('retorna null para input null/undefined', () => {
    expect(normalizeUrl(null)).toBeNull()
    expect(normalizeUrl(undefined)).toBeNull()
  })
})

describe('normalizeRawLead', () => {
  it('normaliza todos os campos de um lead', () => {
    const result = normalizeRawLead({
      externalId: 'test-1',
      name: '  Test Business  ',
      phone: '11987654321',
      website: 'example.com',
      rating: 4.567,
      source: 'google-places',
      rawJson: {},
    })

    expect(result.name).toBe('Test Business')
    expect(result.phone).toBe('+5511987654321')
    expect(result.website).toBe('https://example.com')
    expect(result.rating).toBe(4.6)
  })

  it('preserva externalId e source inalterados', () => {
    const result = normalizeRawLead({
      externalId: 'abc-123',
      name: 'Test',
      source: 'outscraper',
      rawJson: { key: 'value' },
    })

    expect(result.externalId).toBe('abc-123')
    expect(result.source).toBe('outscraper')
  })

  it('trata rating null sem erro', () => {
    const result = normalizeRawLead({
      externalId: 'test',
      name: 'Test',
      rating: null,
      source: 'test',
      rawJson: {},
    })
    expect(result.rating).toBeNull()
  })
})

describe('sanitizeRawJson', () => {
  it('remove campos PII conhecidos', () => {
    const input = {
      name: 'Restaurante Bom',
      owner_name: 'João Silva',
      rating: 4.5,
      cpf: '123.456.789-00',
      personalEmail: 'joao@personal.com',
    }
    const result = sanitizeRawJson(input)
    expect(result.name).toBe('Restaurante Bom')
    expect(result.owner_name).toBe('[PII_REMOVED]')
    expect(result.rating).toBe(4.5)
    expect(result.cpf).toBe('[PII_REMOVED]')
    expect(result.personalEmail).toBe('[PII_REMOVED]')
  })

  it('preserva campos não-PII', () => {
    const input = { category: 'restaurant', phone: '+5511999999999', website: 'example.com' }
    const result = sanitizeRawJson(input)
    expect(result.category).toBe('restaurant')
    expect(result.phone).toBe('+5511999999999')
    expect(result.website).toBe('example.com')
  })

  it('não modifica o objeto original', () => {
    const input = { owner_name: 'João' }
    sanitizeRawJson(input)
    expect(input.owner_name).toBe('João')
  })

  it('remove PII ANINHADO em subobjetos (LGPD)', () => {
    const input = {
      name: 'Restaurante Bom',
      _pii_test_payload: {
        note: 'campo de teste',
        owner_cpf: '123.456.789-00',
        owner_email: 'marco@personal.example',
      },
    }
    const result = sanitizeRawJson(input) as { name: string; _pii_test_payload: Record<string, unknown> }
    expect(result.name).toBe('Restaurante Bom')
    expect(result._pii_test_payload.note).toBe('campo de teste')
    expect(result._pii_test_payload.owner_cpf).toBe('[PII_REMOVED]')
    expect(result._pii_test_payload.owner_email).toBe('[PII_REMOVED]')
    // valor original com PII nao deve sobreviver na serializacao
    expect(JSON.stringify(result)).not.toContain('123.456.789-00')
    expect(JSON.stringify(result)).not.toContain('marco@personal.example')
  })

  it('remove PII dentro de arrays de objetos', () => {
    const input = { partners: [{ owner_name: 'Ana' }, { role: 'gerente' }] }
    const result = sanitizeRawJson(input) as { partners: Array<Record<string, unknown>> }
    expect(result.partners[0].owner_name).toBe('[PII_REMOVED]')
    expect(result.partners[1].role).toBe('gerente')
  })

  it('remove PII com chaves pt-BR, inclusive com diacriticos (R2-2 LGPD)', () => {
    const input = {
      name: 'Restaurante Bom',
      ['proprietário']: 'João Silva',
      email_pessoal: 'joao@gmail.com',
      ['sócio']: { nome: 'Maria' },
      responsavel: 'Pedro',
      data_nascimento: '01/01/1980',
      celular_pessoal: '+5511999998888',
    }
    const result = sanitizeRawJson(input)
    expect(result.name).toBe('Restaurante Bom')
    expect(result['proprietário']).toBe('[PII_REMOVED]')
    expect(result.email_pessoal).toBe('[PII_REMOVED]')
    expect(result['sócio']).toBe('[PII_REMOVED]')
    expect(result.responsavel).toBe('[PII_REMOVED]')
    expect(result.data_nascimento).toBe('[PII_REMOVED]')
    expect(result.celular_pessoal).toBe('[PII_REMOVED]')
    expect(JSON.stringify(result)).not.toContain('joao@gmail.com')
  })
})
