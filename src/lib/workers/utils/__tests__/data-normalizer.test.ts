import { normalizeRawLead, normalizePhone, normalizeUrl, sanitizeRawJson } from '../data-normalizer'

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
})
