/**
 * Declarações ambientes para módulos opcionais que não possuem tipos
 * ou que só são instalados em builds específicas (workers, Sentry opcional,
 * Trigger.dev v3, Playwright para scrapers headless).
 *
 * Isso mantem `tsc --noEmit` verde mesmo quando as dependencias opcionais
 * nao foram instaladas localmente.
 */

declare module '@sentry/nextjs' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const init: (options: Record<string, unknown>) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function withSentryConfig<T = any>(config: T, options?: unknown): T
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const captureException: (e: unknown, context?: any) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const captureMessage: (message: string, context?: any) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const replayIntegration: (options?: any) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const browserTracingIntegration: (options?: any) => any
}

declare module '@trigger.dev/sdk/v3/next' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createRouteHandler(options?: any): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createRequestHandler(options?: any): any
}

declare module 'playwright' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Browser = any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type BrowserContext = any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Page = any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const chromium: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const firefox: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const webkit: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const devices: Record<string, any>
}
