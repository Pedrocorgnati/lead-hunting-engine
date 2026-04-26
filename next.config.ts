import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const isDev = process.env.NODE_ENV === 'development'
const sentryEnabled = !isDev && !!process.env.NEXT_PUBLIC_SENTRY_DSN

function withSentryIfEnabled<T>(config: T): T {
  if (!sentryEnabled) return config
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { withSentryConfig } = require('@sentry/nextjs') as {
      withSentryConfig: (c: T, opts: Record<string, unknown>) => T
    }
    return withSentryConfig(config, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      tunnelRoute: '/monitoring',
      hideSourceMaps: true,
      disableLogger: true,
    })
  } catch {
    return config
  }
}

const supabaseStorageHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
})()

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: supabaseStorageHost
      ? [
          {
            protocol: 'https',
            hostname: supabaseStorageHost,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              isDev
                ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com"
                : "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              isDev
                ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.anthropic.com ws://localhost:* http://localhost:*"
                : "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.anthropic.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default withSentryIfEnabled(withNextIntl(nextConfig))
