import { tasks } from '@trigger.dev/sdk/v3'
import { dispatchJob, type DispatchResult } from './dispatcher'
import { DataSource } from '@/lib/constants/enums'

/**
 * Despacho canonico da coleta (fix critic P0: antes, 7 call-sites chamavam
 * `tasks.trigger('collect-leads')` direto, sem guard — com TRIGGER_SECRET_KEY
 * ausente o request estourava 500 e o CollectionJob ficava PENDING zumbi).
 *
 * Agora: trigger.dev quando configurado; fallback automatico para a
 * local-queue (kind 'collect-leads', processada pelo drain + kick imediato)
 * quando o secret falta ou o trigger falha/timeout. A coleta SEMPRE tem um
 * caminho de execucao.
 */
export interface CollectLeadsDispatchPayload {
  jobId: string
  query: string
  location: string
  radius?: number
  maxResults?: number
  sources?: DataSource[]
  retriedFromId?: string
  correlationId?: string
  origin?: string
}

export async function dispatchCollectLeads(
  payload: CollectLeadsDispatchPayload,
): Promise<DispatchResult> {
  return dispatchJob({
    kind: 'collect-leads',
    payload: payload as CollectLeadsDispatchPayload & Record<string, never>,
    triggerFn: (p) => tasks.trigger('collect-leads', p),
  })
}
