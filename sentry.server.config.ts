/**
 * Sentry server config — carregado pelo Next.js no runtime Node.
 *
 * O import dinamico evita erro quando @sentry/nextjs nao esta instalado.
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
      })
    } catch {
      // @sentry/nextjs ausente — seguir sem observability
    }
  })()
}
