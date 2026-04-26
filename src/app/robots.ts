import type { MetadataRoute } from 'next'

function resolveBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return 'https://lead-hunting.engine'
}

export default function robots(): MetadataRoute.Robots {
  const base = resolveBaseUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: [
          '/api/',
          '/admin/',
          '/dashboard',
          '/coletas',
          '/leads',
          '/radar',
          '/exportar',
          '/perfil',
          '/notifications',
          '/onboarding',
          '/settings',
          '/login',
          '/invite/',
          '/auth/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
