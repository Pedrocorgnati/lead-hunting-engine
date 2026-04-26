/**
 * Sentry client config — carregado pelo Next.js no browser.
 *
 * O import dinamico evita erro quando @sentry/nextjs nao esta instalado
 * (ambientes dev/local onde observability nao e critica).
 */

import { sentryConfig } from './src/lib/observability/sentry'

if (sentryConfig.isEnabled) {
  void (async () => {
    try {
      const Sentry = await import('@sentry/nextjs')
      Sentry.init({
        dsn: sentryConfig.dsn,
        environment: sentryConfig.env,
        release: sentryConfig.release,
        tracesSampleRate: sentryConfig.tracesSampleRate,
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 0.1,
      })
    } catch {
      // @sentry/nextjs ausente — seguir sem observability
    }
  })()
}
