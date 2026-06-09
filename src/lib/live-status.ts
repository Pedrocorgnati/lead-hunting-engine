/**
 * live-status.ts — contrato unico para polling/SSE de status ao vivo.
 *
 * Centraliza os parametros de retry, labels de status e mensagens aria-live
 * usados por A5 (coletas/[id]), AD27-29 (admin/jobs) e AD19 (admin/provedores).
 */

export interface LiveStatusContract {
  /** Timestamp da ultima atualizacao do servidor. */
  lastUpdatedAt: string | null
  /** Label legivel para exibir ao usuario. */
  statusLabel: string
  /** Mensagem para aria-live region (lida por leitores de tela). */
  ariaLiveMessage: string
  /** Milissegundos apos os quais um novo poll deve ser disparado. */
  pollAfter: number
  /** Milissegundos para aguardar antes de retry em caso de erro. */
  retryAfterMs: number
}

export type CollectionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'FAILED_TERMINAL' | 'PAUSED' | 'PARTIAL' | 'CANCELLED'
export type QueueJobStatus = 'PENDING' | 'LEASED' | 'DONE' | 'FAILED'
export type ProviderStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'PAUSED'

const COLLECTION_STATUS_LABEL: Record<CollectionStatus, string> = {
  PENDING: 'Aguardando',
  RUNNING: 'Em execucao',
  COMPLETED: 'Concluida',
  FAILED: 'Falhou',
  FAILED_TERMINAL: 'Falha terminal',
  PAUSED: 'Pausada',
  PARTIAL: 'Parcial',
  CANCELLED: 'Cancelada',
}

const QUEUE_STATUS_LABEL: Record<QueueJobStatus, string> = {
  PENDING: 'Aguardando',
  LEASED: 'Processando',
  DONE: 'Concluido',
  FAILED: 'Falhou',
}

const PROVIDER_STATUS_LABEL: Record<ProviderStatus, string> = {
  UP: 'Operacional',
  DEGRADED: 'Degradado',
  DOWN: 'Fora do ar',
  PAUSED: 'Pausado',
}

const TERMINAL_COLLECTION: CollectionStatus[] = ['COMPLETED', 'FAILED', 'FAILED_TERMINAL', 'CANCELLED', 'PARTIAL']
const TERMINAL_QUEUE: QueueJobStatus[] = ['DONE', 'FAILED']

function isTerminal(status: string, terminals: string[]): boolean {
  return terminals.includes(status)
}

export function collectionLiveStatus(
  status: CollectionStatus,
  lastUpdatedAt: string | null,
): LiveStatusContract {
  const terminal = isTerminal(status, TERMINAL_COLLECTION)
  return {
    lastUpdatedAt,
    statusLabel: COLLECTION_STATUS_LABEL[status] ?? status,
    ariaLiveMessage: `Coleta ${COLLECTION_STATUS_LABEL[status] ?? status}${lastUpdatedAt ? ` (atualizado ${new Date(lastUpdatedAt).toLocaleTimeString('pt-BR')})` : ''}`,
    pollAfter: terminal ? 0 : 5_000,
    retryAfterMs: 10_000,
  }
}

export function queueJobLiveStatus(
  status: QueueJobStatus,
  lastUpdatedAt: string | null,
): LiveStatusContract {
  const terminal = isTerminal(status, TERMINAL_QUEUE)
  return {
    lastUpdatedAt,
    statusLabel: QUEUE_STATUS_LABEL[status] ?? status,
    ariaLiveMessage: `Job ${QUEUE_STATUS_LABEL[status] ?? status}`,
    pollAfter: terminal ? 0 : 5_000,
    retryAfterMs: 10_000,
  }
}

export function providerLiveStatus(
  status: ProviderStatus,
  lastUpdatedAt: string | null,
): LiveStatusContract {
  return {
    lastUpdatedAt,
    statusLabel: PROVIDER_STATUS_LABEL[status] ?? status,
    ariaLiveMessage: `Provedor ${PROVIDER_STATUS_LABEL[status] ?? status}`,
    pollAfter: status === 'DEGRADED' || status === 'DOWN' ? 10_000 : 30_000,
    retryAfterMs: 15_000,
  }
}

export function formatLastUpdated(iso: string | null): string {
  if (!iso) return 'Nunca atualizado'
  return `Atualizado ${new Date(iso).toLocaleTimeString('pt-BR')}`
}
