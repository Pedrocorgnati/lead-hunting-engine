import { ProvenanceService } from '../provenance/provenance-service'

describe('ProvenanceService.buildEntries', () => {
  it('[SUCCESS] constrói entradas para todos os campos disponíveis', () => {
    const entries = ProvenanceService.buildEntries('lead-123', 'raw-456', {
      name: 'Restaurante X',
      phone: '(11) 99999-0000',
      website: 'https://example.com',
      rating: 4.5,
      source: 'google-places',
    })
    expect(entries).toHaveLength(4)
    expect(entries.find(e => e.field === 'name')?.confidence).toBe(0.95)
    expect(entries.find(e => e.field === 'rating')?.source).toBe('google-places')
  })

  it('[EDGE] retorna apenas os campos não-nulos', () => {
    const entries = ProvenanceService.buildEntries('lead-456', 'raw-789', {
      name: 'Loja Y',
      phone: null,
      website: null,
      rating: null,
      source: 'google-places',
    })
    expect(entries).toHaveLength(1)
    expect(entries[0].field).toBe('name')
  })

  it('[EDGE] retorna array vazio quando name está vazio', () => {
    const entries = ProvenanceService.buildEntries('lead-789', 'raw-000', {
      name: '',
      phone: null,
      website: null,
      rating: null,
      source: 'google-places',
    })
    expect(entries).toHaveLength(0)
  })
})
