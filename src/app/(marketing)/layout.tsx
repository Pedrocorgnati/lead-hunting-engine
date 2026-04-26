import { MarketingHeader } from '@/components/landing/MarketingHeader'
import { MarketingFooter } from '@/components/landing/Footer'
import { CookieBanner } from '@/components/landing/CookieBanner'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
      <CookieBanner />
    </div>
  )
}
