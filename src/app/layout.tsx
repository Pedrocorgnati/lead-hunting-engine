import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/shared/theme-provider'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

import { DevOverlayLoader } from '@/components/dev/DevOverlayLoader'

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

export const metadata: Metadata = {
  title: {
    default: 'Lead Hunting Engine',
    template: '%s | Lead Hunting Engine',
  },
  description: 'Plataforma de prospecção automatizada com inteligência artificial.',
  icons: {
    icon: '/images/favicon.ico',
    apple: '/images/apple-icon.png',
  },
  robots: {
    index: false,
    follow: false,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster
              position="top-right"
              richColors
              closeButton
              duration={5000}
            />
            <DevOverlayLoader />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
