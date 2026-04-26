import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Manutenção',
  description: 'Estamos em manutenção. Voltamos em instantes.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-static'

export default function MaintenancePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <svg
            className="h-8 w-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Estamos em manutenção
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Voltamos em instantes. Obrigado pela paciência — estamos melhorando o Lead Hunting Engine
          para você.
        </p>

        <div className="mt-8 flex flex-col items-center gap-2 text-sm">
          <Link
            href="https://status.lead-hunting.engine"
            className="text-primary underline-offset-2 hover:underline"
          >
            Acompanhar status em tempo real
          </Link>
          <p className="text-xs text-muted-foreground">
            Se a manutenção se estender, publicaremos uma nota em nossa página de status.
          </p>
        </div>
      </div>
    </main>
  )
}
