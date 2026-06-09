/**
 * Normalizacao do `errorLog` (Json) de um CollectionJob para a lista canonica
 * consumida pela tela `/coletas/[id]/erros` e pelo export.
 *
 * O `errorLog` no banco e heterogeneo (legado): pode ser
 *  - array de records `{ at, code, message, rootCause, checkpoint, retryable }`
 *  - objeto `{ attempts: [...] }`
 *  - objeto unico
 *  - null (fallback para `errorMessage`)
 *
 * Esta funcao achata tudo para o contrato unico declarado na task B7.
 */

export type CollectionErrorStatus = 'pending' | 'ignored' | 'retried'

export interface CollectionErrorItem {
  errorId: string
  code: string
  message: string
  rootCause: string
  checkpoint: string | null
  timestamp: string | null
  retryable: boolean
  status: CollectionErrorStatus
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function str(record: JsonRecord, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = record[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return undefined
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Extrai a lista plana de records a partir do shape heterogeneo do errorLog. */
function flattenRecords(errorLog: unknown): JsonRecord[] {
  if (Array.isArray(errorLog)) return errorLog.map(asRecord).filter((r): r is JsonRecord => r !== null)
  const obj = asRecord(errorLog)
  if (!obj) return []
  if (Array.isArray(obj.attempts)) {
    return obj.attempts.map(asRecord).filter((r): r is JsonRecord => r !== null)
  }
  return [obj]
}

const RETRYABLE_HINTS = /(timeout|rate.?limit|network|temporar|503|429|provider|backoff|unavailable)/i
const NON_RETRYABLE_HINTS = /(invalid|forbidden|unauthorized|not.?found|malformed|400|401|403|404|validation)/i

function inferRetryable(code: string, message: string, explicit: unknown): boolean {
  if (typeof explicit === 'boolean') return explicit
  const haystack = `${code} ${message}`
  if (NON_RETRYABLE_HINTS.test(haystack)) return false
  if (RETRYABLE_HINTS.test(haystack)) return true
  // Default seguro: erro de coleta e geralmente transitorio.
  return true
}

/**
 * Constroi a lista canonica de erros.
 * @param jobId id do CollectionJob (usado para gerar errorId estaveis)
 * @param errorLog campo Json do job
 * @param errorMessage fallback quando errorLog vazio mas o job falhou
 */
export function buildErrorList(
  jobId: string,
  errorLog: unknown,
  errorMessage: string | null
): CollectionErrorItem[] {
  const records = flattenRecords(errorLog)

  if (records.length === 0) {
    if (errorMessage && errorMessage.trim()) {
      return [
        {
          errorId: `${jobId}-err-0`,
          code: 'COLLECTION_ERROR',
          message: errorMessage,
          rootCause: 'Falha geral da coleta',
          checkpoint: null,
          timestamp: null,
          retryable: true,
          status: 'pending',
        },
      ]
    }
    return []
  }

  return records.map((record, index) => {
    const code = str(record, 'code', 'errorCode') ?? 'UNKNOWN'
    const message = str(record, 'message', 'errorMessage', 'error') ?? 'Erro sem descricao.'
    const rootCause = str(record, 'rootCause', 'cause', 'category') ?? code
    return {
      errorId: str(record, 'id', 'errorId') ?? `${jobId}-err-${index}`,
      code,
      message,
      rootCause,
      checkpoint: str(record, 'checkpoint', 'stage', 'phase') ?? null,
      timestamp: isoOrNull(record.at ?? record.timestamp ?? record.finishedAt ?? record.startedAt),
      retryable: inferRetryable(code, message, record.retryable),
      status: (str(record, 'status') as CollectionErrorStatus | undefined) ?? 'pending',
    }
  })
}
