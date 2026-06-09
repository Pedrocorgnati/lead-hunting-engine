'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Copy,
  Home,
  LifeBuoy,
  RefreshCcw,
  Search,
  Send,
  ShieldAlert,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Routes } from '@/lib/constants'
import { cn } from '@/lib/utils'

type ErrorKind = '404' | '500'
type ReportStatus = 'idle' | 'sending' | 'sent' | 'failed'

interface ErrorExperienceProps {
  kind: ErrorKind
  digest?: string
  onRetry?: () => void
}

interface SearchResult {
  id: string
  title: string
  subtitle?: string
  href: string
  kind: 'lead' | 'job' | 'template'
}

function createCorrelationId(digest?: string) {
  if (digest) return digest
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function ErrorExperience({ kind, digest, onRetry }: ErrorExperienceProps) {
  const router = useRouter()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reportStatus, setReportStatus] = useState<ReportStatus>('idle')

  const correlationId = useMemo(() => createCorrelationId(digest), [digest])
  const isNotFound = kind === '404'

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false

    fetch('/api/v1/profile', { credentials: 'include' })
      .then((response) => {
        if (!cancelled) setIsAuthenticated(response.ok)
      })
      .catch(() => {
        if (!cancelled) setIsAuthenticated(false)
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated || query.trim().length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const response = await fetch(`/api/v1/search?q=${encodeURIComponent(query.trim())}`)
        if (!response.ok) {
          setResults([])
          return
        }
        const payload = await response.json()
        setResults(Array.isArray(payload.data) ? payload.data : [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 220)

    return () => window.clearTimeout(timer)
  }, [isAuthenticated, query])

  async function copyCorrelationId() {
    try {
      await navigator.clipboard.writeText(correlationId)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function reportError() {
    if (reportStatus === 'sending') return

    setReportStatus('sending')
    try {
      const response = await fetch('/api/v1/errors/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          correlationId,
          boundary: kind === '500' ? 'app.error-page' : 'app.not-found-page',
          pathname: window.location.pathname,
          userAgent: navigator.userAgent,
          digest,
          occurredAt: new Date().toISOString(),
        }),
      })
      setReportStatus(response.ok ? 'sent' : 'failed')
    } catch {
      setReportStatus('failed')
    }
  }

  function retry() {
    if (onRetry) {
      onRetry()
      return
    }
    router.refresh()
  }

  const suggestions = isAuthenticated
    ? [
        { label: 'Dashboard', href: Routes.DASHBOARD },
        { label: 'Leads', href: Routes.LEADS },
        { label: 'Coletas', href: Routes.COLETAS },
        { label: 'Perfil', href: Routes.PERFIL },
      ]
    : [
        { label: 'Início', href: Routes.HOME },
        { label: 'Login', href: Routes.LOGIN },
        { label: 'Privacidade', href: Routes.PRIVACIDADE },
      ]

  return (
    <main
      data-testid={`error-${kind}-page`}
      className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6"
    >
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col justify-center gap-6">
        <section className="space-y-5 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
            {isNotFound ? (
              <Search className="size-4" aria-hidden={true} />
            ) : (
              <ShieldAlert className="size-4" aria-hidden={true} />
            )}
            {isNotFound ? 'Erro 404' : 'Erro 500'}
          </div>

          <div className="space-y-3">
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="text-3xl font-semibold tracking-normal outline-none sm:text-4xl"
            >
              {isNotFound ? 'Página não encontrada' : 'Falha inesperada'}
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-7 text-muted-foreground sm:mx-0">
              {isNotFound
                ? 'O endereço pode ter mudado, expirado ou sido removido. Use uma das rotas seguras abaixo para continuar.'
                : 'Não exibimos detalhes técnicos nesta tela. A recuperação abaixo preserva sua sessão e permite reportar o incidente com um ID seguro.'}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={isAuthenticated ? Routes.DASHBOARD : Routes.HOME}
              className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto')}
            >
              <Home aria-hidden={true} />
              {isAuthenticated ? 'Ir ao dashboard' : 'Ir ao início'}
            </Link>
            <Button type="button" variant="outline" size="lg" onClick={() => router.back()}>
              <ArrowLeft aria-hidden={true} />
              Voltar
            </Button>
            {!isNotFound && (
              <Button type="button" variant="outline" size="lg" onClick={retry}>
                <RefreshCcw aria-hidden={true} />
                Tentar novamente
              </Button>
            )}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>{isNotFound ? 'Rotas sugeridas' : 'Recuperação segura'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {suggestions.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg border bg-background px-3 py-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              {isNotFound && authChecked && isAuthenticated && (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                  <label className="text-sm font-medium" htmlFor="error-page-search">
                    Buscar no sistema
                  </label>
                  <div className="flex items-center gap-2">
                    <Search className="size-4 text-muted-foreground" aria-hidden={true} />
                    <Input
                      id="error-page-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Buscar leads, coletas ou templates"
                    />
                  </div>
                  <div aria-live="polite" className="min-h-10">
                    {searching && <p className="text-sm text-muted-foreground">Buscando...</p>}
                    {!searching && query.length >= 2 && results.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhum resultado encontrado.</p>
                    )}
                    {results.length > 0 && (
                      <ul className="space-y-1">
                        {results.slice(0, 5).map((result) => (
                          <li key={`${result.kind}-${result.id}`}>
                            <Link
                              href={result.href}
                              className="block rounded-md px-2 py-2 text-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="font-medium">{result.title}</span>
                              {result.subtitle && (
                                <span className="block text-xs text-muted-foreground">
                                  {result.subtitle}
                                </span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Suporte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium">ID de correlação</p>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {correlationId}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" onClick={copyCorrelationId}>
                  <Copy aria-hidden={true} />
                  {copied ? 'ID copiado' : 'Copiar ID'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={reportError}
                  disabled={reportStatus === 'sending'}
                >
                  <Send aria-hidden={true} />
                  {reportStatus === 'sending' ? 'Reportando...' : 'Reportar incidente'}
                </Button>
              </div>
              <div aria-live="polite" className="min-h-5 text-sm">
                {reportStatus === 'sent' && (
                  <p className="text-muted-foreground">Incidente reportado com sucesso.</p>
                )}
                {reportStatus === 'failed' && (
                  <p className="text-destructive">
                    Não foi possível reportar agora. Copie o ID e tente novamente.
                  </p>
                )}
              </div>
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <LifeBuoy className="mt-0.5 size-4" aria-hidden={true} />
                Nenhuma informação de stack trace é exibida nesta página.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
