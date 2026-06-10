import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import casesIndex from '@/content/cases/index.json'

/**
 * Detalhe de caso de uso (fix do deadend latente do ECU sweep 2026-06-09):
 * a listagem /casos-de-uso gera Link para /casos-de-uso/{slug}, mas esta
 * rota nao existia — o primeiro case publicado em index.json viraria 404.
 * Slug desconhecido -> notFound() (404 padrao do Next).
 */
interface CaseEntry {
  slug: string
  title: string
  client_anonymous: string
  industry: string
  region: string
  duration_weeks: number
  publishedAt: string
  excerpt: string
  body?: string
  results?: Array<{ label: string; value: string }>
}

function findCase(slug: string): CaseEntry | undefined {
  return (casesIndex as { cases: CaseEntry[] }).cases.find((c) => c.slug === slug)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const entry = findCase(slug)
  if (!entry) return { title: 'Caso nao encontrado — Lead Hunting Engine' }
  return {
    title: `${entry.title} — Casos de uso`,
    description: entry.excerpt,
    alternates: { canonical: `/casos-de-uso/${entry.slug}` },
  }
}

export default async function CasoDeUsoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const entry = findCase(slug)
  if (!entry) notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/casos-de-uso" className="text-sm text-blue-600 hover:underline">
        ← Todos os casos de uso
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{entry.title}</h1>
      <p className="mt-2 text-sm text-gray-500">
        {entry.client_anonymous} · {entry.industry} · {entry.region} · {entry.duration_weeks} semanas
      </p>

      {entry.results && entry.results.length > 0 && (
        <dl className="mt-8 grid gap-4 sm:grid-cols-3">
          {entry.results.map((r) => (
            <div key={r.label} className="rounded-lg border border-gray-200 p-4 text-center">
              <dd className="text-2xl font-semibold text-blue-600">{r.value}</dd>
              <dt className="mt-1 text-xs text-gray-500">{r.label}</dt>
            </div>
          ))}
        </dl>
      )}

      <article className="prose prose-gray mt-8 max-w-none">
        {entry.body ? (
          entry.body.split('\n\n').map((paragraph, idx) => <p key={idx}>{paragraph}</p>)
        ) : (
          <p>{entry.excerpt}</p>
        )}
      </article>
    </main>
  )
}
