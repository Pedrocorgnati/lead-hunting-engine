import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Analytics as VercelAnalytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

import { DevOverlayLoader } from '@/components/dev/DevOverlayLoader'
import { Analytics } from '@/components/analytics/Analytics'
import { WebVitals } from '@/components/analytics/WebVitals'
import { OfflineBanner } from '@/components/shared/OfflineBanner'
import { AuthOfflineBanner } from '@/components/shared/AuthOfflineBanner'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
  'https://lead-hunting.engine'

export const viewport: Viewport = {
  themeColor: '#4F46E5',
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Lead Hunting Engine',
    template: '%s | Lead Hunting Engine',
  },
  description: 'Plataforma de prospecção automatizada com inteligência artificial.',
  icons: {
    icon: '/images/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    images: [{ url: '/images/og-image.png', width: 1200, height: 630 }],
    siteName: 'Lead Hunting Engine',
  },
}

// TASK-1/ST005 (CL-305): JSON-LD Organization
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Lead Hunting Engine',
  url: APP_URL,
  logo: `${APP_URL}/images/og-image.png`,
  description:
    'Plataforma B2B de prospecção automatizada com coleta multi-fonte, scoring IA e compliance LGPD.',
  sameAs: [],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <OfflineBanner />
            <AuthOfflineBanner />
            {children}
            <Toaster
              position="top-right"
              richColors
              closeButton
              duration={5000}
            />
            <DevOverlayLoader />
            <VercelAnalytics />
            <SpeedInsights />
            <Analytics />
            <WebVitals />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
