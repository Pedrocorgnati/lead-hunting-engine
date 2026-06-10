'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * use-live-poll.ts — cliente reutilizavel de polling live (B22.1, itens
 * 047/048/049/050).
 *
 * Contrato: o endpoint retorna `{ data: T }` e, quando aplicavel, um bloco
 * `live: LiveStatusContract` (src/lib/live-status.ts) dentro de `data` com
 * `pollAfter` (0 = estado terminal, para de pollar) e `retryAfterMs`
 * (honrado em caso de erro HTTP/rede — item 048).
 *
 * Garantias:
 *  - AbortController por request + timeout configuravel (default 10s)
 *  - retryAfterMs do servidor honrado; fallback exponencial 2x ate 60s
 *  - erro NUNCA e silencioso: exposto em `error` + callback onError
 *  - para automaticamente em estado terminal (pollAfter === 0)
 *
 * Compatibilidade com polling local (B5 coletas, B6 fila, B10 radar):
 * os paineis legados que pollavam com setInterval proprio podem migrar
 * passando `intervalMs` fixo (mesmo comportamento) e adotar o contrato
 * `live` incrementalmente — o hook usa `live.pollAfter` apenas quando o
 * payload o fornece; sem ele, `intervalMs` continua mandando.
 */
export interface LiveContractFields {
  pollAfter?: number
  retryAfterMs?: number
}

export interface UseLivePollOptions<T> {
  /** Intervalo base entre polls (ms). Sobrescrito por data.live.pollAfter quando presente. */
  intervalMs?: number
  /** Timeout por request (ms). */
  timeoutMs?: number
  /** Pausa o polling sem desmontar o estado. */
  enabled?: boolean
  /** Extrai o bloco live do payload (default: data.live). */
  getLive?: (data: T) => LiveContractFields | undefined
  onError?: (message: string) => void
}

export interface UseLivePollResult<T> {
  data: T | null
  error: string | null
  lastUpdated: Date | null
  polling: boolean
  refresh: () => Promise<void>
}

export function useLivePoll<T>(url: string, options: UseLivePollOptions<T> = {}): UseLivePollResult<T> {
  const { intervalMs = 5_000, timeoutMs = 10_000, enabled = true } = options
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [polling, setPolling] = useState(enabled)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const failuresRef = useRef(0)
  const mountedRef = useRef(true)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  const tick = useCallback(async (): Promise<void> => {
    clearTimer()
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let nextDelay: number | null = intervalMs
    try {
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
      const json = (await res.json()) as { data: T }
      if (!mountedRef.current) return
      setData(json.data)
      setError(null)
      setLastUpdated(new Date())
      failuresRef.current = 0

      const live =
        optionsRef.current.getLive?.(json.data) ??
        ((json.data as { live?: LiveContractFields } | null)?.live)
      if (live?.pollAfter !== undefined) {
        nextDelay = live.pollAfter > 0 ? live.pollAfter : null
      }
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted && (err as Error).name === 'AbortError' && !mountedRef.current) return
      const message = (err as Error).name === 'AbortError'
        ? 'Tempo limite excedido ao atualizar.'
        : (err as Error).message || 'Erro de rede.'
      setError(message)
      optionsRef.current.onError?.(message)
      failuresRef.current += 1
      // retryAfterMs do ultimo payload conhecido; fallback exponencial.
      const lastLive =
        (data && (optionsRef.current.getLive?.(data) ?? (data as { live?: LiveContractFields }).live)) || undefined
      const base = lastLive?.retryAfterMs ?? intervalMs * 2
      nextDelay = Math.min(base * Math.max(1, 2 ** (failuresRef.current - 1)), 60_000)
    } finally {
      clearTimeout(timeout)
    }

    if (mountedRef.current && enabled && nextDelay !== null) {
      timerRef.current = setTimeout(() => void tick(), nextDelay)
      setPolling(true)
    } else if (mountedRef.current) {
      setPolling(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, intervalMs, timeoutMs, enabled])

  useEffect(() => {
    mountedRef.current = true
    if (enabled) void tick()
    return () => {
      mountedRef.current = false
      clearTimer()
      abortRef.current?.abort()
    }
  }, [tick, enabled])

  const refresh = useCallback(async () => { await tick() }, [tick])

  return { data, error, lastUpdated, polling, refresh }
}
