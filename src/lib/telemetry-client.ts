'use client'

/**
 * telemetry-client.ts (C14.2): reporte de eventos ECU a partir do browser
 * para POST /api/v1/telemetry/event. Fire-and-forget; falha nunca afeta o
 * fluxo do usuario. Para abandono de fluxo usa sendBeacon (sobrevive ao
 * unload da pagina).
 */
import type { TelemetryEventKind } from '@/lib/telemetry'

export interface EcuClientEvent {
  kind: TelemetryEventKind
  correlationId?: string
  route?: string
  resourceId?: string
  resourceType?: string
  metadata?: Record<string, unknown>
}

const ENDPOINT = '/api/v1/telemetry/event'

export function reportEcuEvent(event: EcuClientEvent): void {
  const payload = {
    ...event,
    route: event.route ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
  }
  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // nunca propagar
  }
}

/** Variante para unload de pagina (abandono): usa sendBeacon quando disponivel. */
export function reportEcuEventOnUnload(event: EcuClientEvent): void {
  const payload = JSON.stringify({
    ...event,
    route: event.route ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
  })
  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    try {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }))
      return
    } catch {
      // cai no fetch keepalive
    }
  }
  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // nunca propagar
  }
}
