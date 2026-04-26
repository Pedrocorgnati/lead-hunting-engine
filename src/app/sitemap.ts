import type { MetadataRoute } from 'next'

function resolveBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return 'https://lead-hunting.engine'
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = resolveBaseUrl()
  const now = new Date()

  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${base}/contato`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${base}/privacidade`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${base}/termos`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ]
}
