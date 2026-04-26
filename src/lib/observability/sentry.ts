import { z } from 'zod'

/**
 * Sentry integration wrapper.
 *
 * Gracefully no-ops when:
 *   - NEXT_PUBLIC_SENTRY_DSN is not set (DSN schema returns undefined)
 *   - @sentry/nextjs is not installed (dev/local flows)
 *
 * Production must provide NEXT_PUBLIC_SENTRY_DSN + install `@sentry/nextjs`.
 * Dev bypass (ver next.config.ts): `isDev ? (c)=>c : withSentryConfig(c, ...)`.
 */

const DsnSchema = z.string().url().optional()

export const sentryConfig = {
  dsn: DsnSchema.parse(process.env.NEXT_PUBLIC_SENTRY_DSN),
  env: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  isEnabled: process.env.NODE_ENV === 'production' && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
}

type SentryLike = {
  captureException: (error: unknown, hint?: unknown) => string
  captureMessage: (message: string, level?: string) => string
  setTag: (key: string, value: string) => void
  flush: (timeout?: number) => Promise<boolean>
}

let sentryClient: SentryLike | null = null

function loadSentry(): SentryLike | null {
  if (sentryClient) return sentryClient
  if (!sentryConfig.isEnabled) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sentryClient = require('@sentry/nextjs') as SentryLike
    return sentryClient
  } catch {
    return null
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const sentry = loadSentry()
  if (!sentry) return
  try {
    if (context) {
      for (const [k, v] of Object.entries(context)) {
        sentry.setTag(k, String(v))
      }
    }
    sentry.captureException(error)
  } catch {
    // never throw from observability
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  const sentry = loadSentry()
  if (!sentry) return
  try {
    sentry.captureMessage(message, level)
  } catch {
    // never throw
  }
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  const sentry = loadSentry()
  if (!sentry) return
  try {
    await sentry.flush(timeoutMs)
  } catch {
    // never throw
  }
}
