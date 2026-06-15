// Testes do ProvenanceService (criterios 15-16 do doc da feature 06-11):
// mapeamento completo de fontes, skip de fonte desconhecida (nunca fallback
// para GOOGLE_MAPS), persistencia de sourceUrl/rawLeadDataId e dedup em codigo
// (DataProvenance nao tem unique constraint, skipDuplicates nao funciona).

const findManyMock = jest.fn()
const createManyMock = jest.fn()
jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    dataProvenance: {
      findMany: (...args: unknown[]) => findManyMock(...(args as never[])),
      createMany: (...args: unknown[]) => createManyMock(...(args as never[])),
    },
  }),
}))

import { ProvenanceService, ProvenanceEntry } from '../provenance-service'
import { DataSource } from '@/lib/constants/enums'

describe('ProvenanceService.recordBatch', () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    findManyMock.mockResolvedValue([])
    createManyMock.mockResolvedValue({ count: 0 })
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('[SUCCESS] mapeia fonte "website" para DataSource.WEBSITE', async () => {
    const entries: ProvenanceEntry[] = [
      { leadId: 'lead-1', rawLeadDataId: null, field: 'email', source: 'website', confidence: 0.85 },
    ]
    await ProvenanceService.recordBatch(entries)

    expect(createManyMock).toHaveBeenCalledTimes(1)
    const { data } = createManyMock.mock.calls[0][0]
    expect(data).toHaveLength(1)
    expect(data[0].source).toBe(DataSource.WEBSITE)
  })

  it('[SUCCESS] aceita o nome exato do enum como fonte (ex: "WEBSITE")', async () => {
    await ProvenanceService.recordBatch([
      { leadId: 'lead-1', field: 'email', source: 'WEBSITE', confidence: 0.85 },
    ])

    expect(createManyMock).toHaveBeenCalledTimes(1)
    expect(createManyMock.mock.calls[0][0].data[0].source).toBe(DataSource.WEBSITE)
  })

  it('[EDGE] fonte desconhecida e pulada (nao gravada) com erro logado — nunca vira GOOGLE_MAPS', async () => {
    await ProvenanceService.recordBatch([
      { leadId: 'lead-1', field: 'email', source: 'fonte-misteriosa', confidence: 0.5 },
    ])

    expect(createManyMock).not.toHaveBeenCalled()
    expect(findManyMock).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('fonte-misteriosa'))
  })

  it('[EDGE] em batch misto, so a entrada de fonte desconhecida e descartada', async () => {
    await ProvenanceService.recordBatch([
      { leadId: 'lead-1', field: 'email', source: 'fonte-misteriosa', confidence: 0.5 },
      { leadId: 'lead-1', field: 'phone', source: 'google-places', confidence: 0.9 },
    ])

    expect(createManyMock).toHaveBeenCalledTimes(1)
    const { data } = createManyMock.mock.calls[0][0]
    expect(data).toHaveLength(1)
    expect(data[0].field).toBe('phone')
    expect(data[0].source).toBe(DataSource.GOOGLE_MAPS)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('[SUCCESS] persiste sourceUrl quando informado', async () => {
    await ProvenanceService.recordBatch([
      {
        leadId: 'lead-1',
        field: 'email',
        source: 'website',
        confidence: 0.85,
        sourceUrl: 'https://example.com/contato',
      },
    ])

    expect(createManyMock.mock.calls[0][0].data[0].sourceUrl).toBe('https://example.com/contato')
  })

  it('[SUCCESS] persiste rawLeadDataId null quando ausente (crawl sem raw row)', async () => {
    await ProvenanceService.recordBatch([
      { leadId: 'lead-1', field: 'email', source: 'website', confidence: 0.85 },
    ])

    const row = createManyMock.mock.calls[0][0].data[0]
    expect(row.rawLeadDataId).toBeNull()
    expect(row.sourceUrl).toBeNull()
  })

  it('[SUCCESS] dedup em codigo filtra entrada ja registrada com mesmo (leadId, field, source)', async () => {
    findManyMock.mockResolvedValue([
      { leadId: 'lead-1', field: 'email', source: DataSource.WEBSITE },
    ])

    await ProvenanceService.recordBatch([
      { leadId: 'lead-1', field: 'email', source: 'website', confidence: 0.85 },
      { leadId: 'lead-1', field: 'phone', source: 'website', confidence: 0.9 },
    ])

    // Consulta restrita aos (leadId, field) do batch
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { leadId: 'lead-1', field: 'email' },
            { leadId: 'lead-1', field: 'phone' },
          ],
        },
      }),
    )

    const { data } = createManyMock.mock.calls[0][0]
    expect(data).toHaveLength(1)
    expect(data[0].field).toBe('phone')
  })

  it('[EDGE] nao chama createMany quando todas as entradas ja existem', async () => {
    findManyMock.mockResolvedValue([
      { leadId: 'lead-1', field: 'email', source: DataSource.WEBSITE },
    ])

    await ProvenanceService.recordBatch([
      { leadId: 'lead-1', field: 'email', source: 'website', confidence: 0.85 },
    ])

    expect(createManyMock).not.toHaveBeenCalled()
  })

  it('[EDGE] duplicata intra-batch e inserida uma unica vez', async () => {
    await ProvenanceService.recordBatch([
      { leadId: 'lead-1', field: 'email', source: 'website', confidence: 0.85 },
      { leadId: 'lead-1', field: 'email', source: 'website', confidence: 0.85 },
    ])

    expect(createManyMock.mock.calls[0][0].data).toHaveLength(1)
  })

  it('[EDGE] mesma (leadId, field) com source diferente NAO e tratada como duplicata', async () => {
    findManyMock.mockResolvedValue([
      { leadId: 'lead-1', field: 'email', source: DataSource.GOOGLE_MAPS },
    ])

    await ProvenanceService.recordBatch([
      { leadId: 'lead-1', field: 'email', source: 'website', confidence: 0.85 },
    ])

    expect(createManyMock.mock.calls[0][0].data).toHaveLength(1)
  })

  it('[ERROR] falha de banco nao lanca (comportamento nao-bloqueante)', async () => {
    createManyMock.mockRejectedValue(new Error('db down'))

    await expect(
      ProvenanceService.recordBatch([
        { leadId: 'lead-1', field: 'email', source: 'website', confidence: 0.85 },
      ]),
    ).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith(
      '[ProvenanceService] Falha ao registrar provenance:',
      expect.any(Error),
    )
  })

  it('[EDGE] batch vazio e no-op (nenhuma query)', async () => {
    await ProvenanceService.recordBatch([])
    expect(findManyMock).not.toHaveBeenCalled()
    expect(createManyMock).not.toHaveBeenCalled()
  })
})

describe('ProvenanceService.buildEntries (retrocompatibilidade)', () => {
  it('[SUCCESS] continua aceitando rawLeadDataId string', () => {
    const entries = ProvenanceService.buildEntries('lead-1', 'raw-1', {
      name: 'Padaria Z',
      phone: '(11) 98888-0000',
      website: 'https://example.com',
      rating: 4.2,
      source: 'google-places',
    })
    expect(entries).toHaveLength(4)
    expect(entries.every(e => e.rawLeadDataId === 'raw-1')).toBe(true)
  })
})
