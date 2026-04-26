import { LegalFooter } from '@/components/shared/legal-footer'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col">{children}</div>
      <LegalFooter className="mx-auto w-full max-w-md px-4" />
    </div>
  )
}
