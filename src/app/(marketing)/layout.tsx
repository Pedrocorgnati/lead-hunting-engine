import { MarketingHeader } from '@/components/landing/MarketingHeader'
import { MarketingFooter } from '@/components/landing/Footer'
import { CookieBanner } from '@/components/landing/CookieBanner'
import { SkipLink } from '@/components/SkipLink'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink targetId="main-content" />
      <MarketingHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 focus-visible:outline-none"
      >
        {children}
      </main>
      <MarketingFooter />
      <CookieBanner />
    </div>
  )
}
