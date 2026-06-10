import { buildErrorList, type CollectionErrorItem } from '../_errors-mapper'

const JOB_ID = 'job-1'

describe('buildErrorList', () => {
  it('achata array de records com campos canonicos', () => {
    const log = [
      { code: 'TIMEOUT', message: 'Provider timeout', rootCause: 'network', checkpoint: 'page-3', at: '2026-06-01T10:00:00Z', retryable: true },
    ]
    const [item] = buildErrorList(JOB_ID, log, null)
    expect(item).toMatchObject({
      errorId: 'job-1-err-0',
      code: 'TIMEOUT',
      rootCause: 'network',
      checkpoint: 'page-3',
      retryable: true,
      status: 'pending',
    })
    expect(item.timestamp).toBe('2026-06-01T10:00:00.000Z')
  })

  it('suporta shape { attempts: [...] }', () => {
    const log = { attempts: [{ code: 'E1', message: 'a' }, { code: 'E2', message: 'b' }] }
    expect(buildErrorList(JOB_ID, log, null)).toHaveLength(2)
  })

  it('fallback para errorMessage quando errorLog vazio', () => {
    const [item] = buildErrorList(JOB_ID, null, 'Falhou geral')
    expect(item.code).toBe('COLLECTION_ERROR')
    expect(item.message).toBe('Falhou geral')
    expect(item.retryable).toBe(true)
  })

  it('infere retryable=false para erros de validacao/autorizacao', () => {
    const [item] = buildErrorList(JOB_ID, [{ code: 'FORBIDDEN_403', message: 'forbidden' }], null)
    expect(item.retryable).toBe(false)
  })

  it('round-trip estavel: shape persistido por persistErrorList re-le identico', () => {
    // Espelho do shape gravado em _error-actions.persistErrorList — se este
    // teste quebrar, o status retried/ignored deixa de sobreviver ao reload.
    const original = buildErrorList(JOB_ID, [
      { code: 'TIMEOUT', message: 'x', rootCause: 'net', checkpoint: 'p1', at: '2026-06-01T10:00:00Z', retryable: true },
      { code: 'BAD_INPUT_400', message: 'y', retryable: false },
    ], null)

    const marked: CollectionErrorItem[] = original.map((item, i) =>
      i === 0 ? { ...item, status: 'retried' } : { ...item, status: 'ignored' }
    )
    const persisted = marked.map((item) => ({
      id: item.errorId,
      code: item.code,
      message: item.message,
      rootCause: item.rootCause,
      checkpoint: item.checkpoint,
      at: item.timestamp,
      retryable: item.retryable,
      status: item.status,
    }))

    const reread = buildErrorList(JOB_ID, persisted, null)
    expect(reread).toEqual(marked)
  })
})
