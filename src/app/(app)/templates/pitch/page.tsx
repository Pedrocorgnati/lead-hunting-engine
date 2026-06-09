import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Star, Copy, Trash2, Search } from 'lucide-react'
import { getPitchTemplates, deletePitchTemplate, duplicatePitchTemplate } from '@/actions/pitch-templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TONE_OPTIONS, TONE_LABELS, ToneOption } from '@/lib/pitch/tone-config'

export const metadata: Metadata = {
  title: 'Templates de pitch',
}

interface PageProps {
  searchParams: Promise<{
    search?: string
    tone?: string
    page?: string
  }>
}

export default async function TemplatesPitchPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1') || 1)
  const { data: templates, pages } = await getPitchTemplates({
    page,
    search: params.search,
    tone: params.tone,
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Templates de pitch</h1>
          <p className="text-sm text-muted-foreground">
            Crie, edite e versione templates de pitch para leads.
          </p>
        </div>
        <Link href="/templates/pitch/novo">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Novo template
          </Button>
        </Link>
      </div>

      <form className="flex gap-2" method="get">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            name="search"
            placeholder="Buscar templates..."
            defaultValue={params.search}
            className="pl-8"
          />
        </div>
        <select
          name="tone"
          defaultValue={params.tone ?? ''}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">Todos os tons</option>
          {TONE_OPTIONS.map((tone) => (
            <option key={tone} value={tone}>
              {TONE_LABELS[tone] ?? tone}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum template encontrado.
            {params.search || params.tone ? ' Tente ajustar os filtros.' : ' Crie o primeiro template de pitch.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className={t.isFavorite ? 'border-yellow-400' : undefined}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  {t.isFavorite && (
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" aria-label="Favorito" />
                  )}
                </div>
                <Badge variant="outline">{TONE_LABELS[t.tone as ToneOption] ?? t.tone}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-3 text-sm text-muted-foreground">{t.content}</p>
                <div className="flex gap-2">
                  <Link href={`/templates/pitch/${t.id}`} className="flex-1">
                    <Button variant="secondary" className="w-full" size="sm">
                      Editar
                    </Button>
                  </Link>
                  <form
                    action={async () => {
                      'use server'
                      await duplicatePitchTemplate(t.id)
                    }}
                  >
                    <Button variant="outline" size="sm" type="submit" title="Duplicar">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </form>
                  <form
                    action={async () => {
                      'use server'
                      await deletePitchTemplate(t.id)
                    }}
                  >
                    <Button variant="outline" size="sm" type="submit" title="Remover" className="text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/templates/pitch?page=${p}${params.search ? `&search=${encodeURIComponent(params.search)}` : ''}${params.tone ? `&tone=${params.tone}` : ''}`}
            >
              <Button variant={p === page ? 'default' : 'outline'} size="sm">
                {p}
              </Button>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
