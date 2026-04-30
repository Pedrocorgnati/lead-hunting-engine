import type { Metadata } from 'next'
import Link from 'next/link'
import casesIndex from '@/content/cases/index.json'

export const metadata: Metadata = {
  title: 'Casos de uso — Lead Hunting Engine',
  description:
    'Estudos de caso reais de operadores que usaram o Lead Hunting Engine para automatizar prospeccao B2B com compliance LGPD.',
  alternates: { canonical: '/casos-de-uso' },
}

interface CaseSummary {
  slug: string
  title: string
  client_anonymous: string
  industry: string
  region: string
  duration_weeks: number
  publishedAt: string
  excerpt: string
}

export default function CasosDeUsoPage() {
  const cases = (casesIndex as { cases: CaseSummary[] }).cases

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Casos de uso</h1>
      <p className="mt-2 text-base text-gray-600">
        Operadores reais. Resultados auditados. Identidades preservadas.
      </p>

      {cases.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-gray-600">
            Estamos preparando os primeiros estudos de caso do programa piloto.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Quer ser o primeiro? Entre na nossa <Link href="/" className="text-blue-600 hover:underline">waitlist</Link>.
          </p>
        </div>
      ) : (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2">
          {cases.map((c) => (
            <li key={c.slug} className="rounded-lg border border-gray-200 p-5 hover:border-blue-300">
              <Link href={`/casos-de-uso/${c.slug}`} className="block">
                <h2 className="text-lg font-semibold">{c.title}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {c.industry} · {c.region} · {c.duration_weeks} semanas
                </p>
                <p className="mt-3 text-sm text-gray-700">{c.excerpt}</p>
                <p className="mt-3 text-sm font-medium text-blue-600">Ler caso completo →</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
