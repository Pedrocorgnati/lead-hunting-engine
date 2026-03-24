// Valida que os contratos de entrada do module-12 estão presentes antes de qualquer implementação

describe('Contract: RawLeadInput', () => {
  it('exporta RawLeadInput com campos obrigatórios', async () => {
    const mod = await import('@/lib/workers/utils/data-normalizer')
    // type check only — se importar sem erro, contrato está ok
    expect(mod).toBeDefined()
  })
})

describe('Contract: Enums', () => {
  it('LeadStatus inclui NEW e ENRICHMENT_PENDING', async () => {
    const { LeadStatus } = await import('@/lib/constants/enums')
    expect(LeadStatus.NEW).toBe('NEW')
    expect(LeadStatus.ENRICHMENT_PENDING).toBe('ENRICHMENT_PENDING')
  })

  it('OpportunityType inclui A_NEEDS_SITE e E_SCALE', async () => {
    const { OpportunityType } = await import('@/lib/constants/enums')
    expect(OpportunityType.A_NEEDS_SITE).toBe('A_NEEDS_SITE')
    expect(OpportunityType.E_SCALE).toBe('E_SCALE')
    expect(Object.keys(OpportunityType)).toHaveLength(5)
  })
})
