/**
 * api-response.ts - envelope canonico para respostas da API.
 *
 * Cobre contratos C13.1 (sucesso/erro), C13.2 (listas/quotas) e C13.3 (jobs/rate-limit),
 * alem dos metadados de UI acessivel (display status, aria-live, proxima acao, retry).
 * Todos os endpoints devem retornar envelopes tipados por estas funcoes.
 *
 * Contrato para handlers novos e modificados:
 * - Sucesso simples: successEnvelope(data, correlationId?, lastUpdatedAt?) ou apiSuccess(...).
 * - Sucesso completo (meta, links, warnings, correlationId, requestId, serverTime, rateLimit):
 *   successEnvelopeFull(data, opts) ou apiSuccessFull(data, status, opts).
 * - Erro: errorEnvelope(code, message, correlationId?, statusCode?) ou apiError(...).
 * - Listas: paginatedEnvelope(items, meta, correlationId?) ou apiPaginated(...).
 * - Quota: quotaEnvelope(used, limit, resetAt).
 * - Rate-limit: rateLimitEnvelope(retryAfterMs, limit, remaining, windowMs).
 * - Status acessivel (live): liveStatusEnvelope(...).
 * - Metadados de UI (displayStatus, statusLabel, emptyStateReason, nextActionLabel, ariaLiveMessage, retryAt):
 *   uiMetaEnvelope(opts).
 *
 * @example
 *   // handler novo: sucesso completo e rastreavel
 *   return apiSuccessFull(lead, 200, { correlationId, requestId, links: { self: '/api/v1/leads/1' } })
 * @example
 *   // estado vazio acessivel para a UI
 *   const ui = uiMetaEnvelope({
 *     displayStatus: 'empty',
 *     statusLabel: 'Sem leads',
 *     emptyStateReason: 'Nenhum lead encontrado para os filtros atuais',
 *     nextActionLabel: 'Importar leads',
 *     ariaLiveMessage: 'Lista vazia',
 *   })
 */
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// C13.1 - Sucesso / Erro
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  data: T
  correlationId?: string
  requestId?: string
  serverTime?: string
  lastUpdatedAt?: string
  links?: Record<string, string>
  warnings?: string[]
}

/** Metadados de resposta agregados (rastreabilidade + rate-limit). */
export interface ResponseMeta {
  correlationId?: string
  requestId?: string
  serverTime?: string
  rateLimit?: RateLimitEnvelope
}

/** Sucesso com bloco meta agregado (todos os campos rastreaveis da task C13.1). */
export interface ApiSuccessFull<T> extends ApiSuccess<T> {
  meta: ResponseMeta
}

export interface ApiError {
  error: {
    code: string
    message: string
    correlationId?: string
    requestId?: string
    statusCode?: number
  }
}

export interface PaginatedMeta {
  page: number
  limit: number
  total: number
  hasNext: boolean
  hasPrev: boolean
}

export interface PaginatedSuccess<T> extends ApiSuccess<T[]> {
  meta: PaginatedMeta
}

export interface QuotaEnvelope {
  used: number
  limit: number
  resetAt: string | null
  remaining: number
  percentUsed: number
}

export interface RateLimitEnvelope {
  retryAfterMs: number
  retryAt: string
  limit: number
  remaining: number
  windowMs: number
}

export interface LiveStatusEnvelope {
  status: string
  statusLabel: string
  ariaLiveMessage: string
  lastUpdatedAt: string | null
  pollAfter: number
  correlationId?: string
}

/** Metadados de UI acessivel para estados de tela (P14, A3, A5, AD20/23/27/28). */
export interface UiMeta {
  displayStatus: string
  statusLabel: string
  emptyStateReason?: string
  nextActionLabel?: string
  ariaLiveMessage: string
  retryAt?: string
}

/** Opcoes do envelope de sucesso completo (todos os campos rastreaveis da task C13.1). */
export interface SuccessEnvelopeOptions {
  correlationId?: string
  requestId?: string
  serverTime?: string
  lastUpdatedAt?: string
  links?: Record<string, string>
  warnings?: string[]
  rateLimit?: RateLimitEnvelope
}

export function successEnvelope<T>(data: T, correlationId?: string, lastUpdatedAt?: string): ApiSuccess<T> {
  return {
    data,
    ...(correlationId ? { correlationId } : {}),
    ...(lastUpdatedAt ? { lastUpdatedAt } : {}),
  }
}

/**
 * Envelope de sucesso completo: agrega data + meta (correlationId, requestId,
 * serverTime, rateLimit) + links + warnings. serverTime e preenchido
 * automaticamente quando omitido.
 */
export function successEnvelopeFull<T>(data: T, opts: SuccessEnvelopeOptions = {}): ApiSuccessFull<T> {
  const serverTime = opts.serverTime ?? new Date().toISOString()
  const meta: ResponseMeta = {
    ...(opts.correlationId ? { correlationId: opts.correlationId } : {}),
    ...(opts.requestId ? { requestId: opts.requestId } : {}),
    serverTime,
    ...(opts.rateLimit ? { rateLimit: opts.rateLimit } : {}),
  }
  return {
    data,
    ...(opts.correlationId ? { correlationId: opts.correlationId } : {}),
    ...(opts.requestId ? { requestId: opts.requestId } : {}),
    serverTime,
    ...(opts.lastUpdatedAt ? { lastUpdatedAt: opts.lastUpdatedAt } : {}),
    ...(opts.links ? { links: opts.links } : {}),
    ...(opts.warnings && opts.warnings.length ? { warnings: opts.warnings } : {}),
    meta,
  }
}

export function errorEnvelope(code: string, message: string, correlationId?: string, statusCode?: number): ApiError {
  return {
    error: {
      code,
      message,
      ...(correlationId ? { correlationId } : {}),
      ...(statusCode ? { statusCode } : {}),
    },
  }
}

export function paginatedEnvelope<T>(
  items: T[],
  meta: PaginatedMeta,
  correlationId?: string,
): PaginatedSuccess<T> {
  return { data: items, meta, ...(correlationId ? { correlationId } : {}) }
}

export function quotaEnvelope(used: number, limit: number, resetAt: string | null): QuotaEnvelope {
  return {
    used,
    limit,
    resetAt,
    remaining: Math.max(0, limit - used),
    percentUsed: limit > 0 ? Math.round((used / limit) * 100) : 0,
  }
}

export function rateLimitEnvelope(retryAfterMs: number, limit: number, remaining: number, windowMs: number): RateLimitEnvelope {
  return {
    retryAfterMs,
    retryAt: new Date(Date.now() + retryAfterMs).toISOString(),
    limit,
    remaining,
    windowMs,
  }
}

export function liveStatusEnvelope(
  status: string,
  statusLabel: string,
  ariaLiveMessage: string,
  lastUpdatedAt: string | null,
  pollAfter: number,
  correlationId?: string,
): LiveStatusEnvelope {
  return { status, statusLabel, ariaLiveMessage, lastUpdatedAt, pollAfter, ...(correlationId ? { correlationId } : {}) }
}

/**
 * Metadados de UI acessivel: garante displayStatus/statusLabel/ariaLiveMessage
 * sempre presentes; emptyStateReason/nextActionLabel/retryAt aparecem apenas
 * quando fornecidos. Cobre estados loading/empty/error/success na camada de tela.
 */
export function uiMetaEnvelope(opts: UiMeta): UiMeta {
  return {
    displayStatus: opts.displayStatus,
    statusLabel: opts.statusLabel,
    ariaLiveMessage: opts.ariaLiveMessage,
    ...(opts.emptyStateReason ? { emptyStateReason: opts.emptyStateReason } : {}),
    ...(opts.nextActionLabel ? { nextActionLabel: opts.nextActionLabel } : {}),
    ...(opts.retryAt ? { retryAt: opts.retryAt } : {}),
  }
}

export function apiSuccess<T>(data: T, status = 200, correlationId?: string) {
  return NextResponse.json(successEnvelope(data, correlationId), { status })
}

export function apiSuccessFull<T>(data: T, status = 200, opts: SuccessEnvelopeOptions = {}) {
  return NextResponse.json(successEnvelopeFull(data, opts), { status })
}

export function apiError(code: string, message: string, status: number, correlationId?: string) {
  return NextResponse.json(errorEnvelope(code, message, correlationId, status), { status })
}

export function apiPaginated<T>(items: T[], meta: PaginatedMeta, correlationId?: string) {
  return NextResponse.json(paginatedEnvelope(items, meta, correlationId), { status: 200 })
}
