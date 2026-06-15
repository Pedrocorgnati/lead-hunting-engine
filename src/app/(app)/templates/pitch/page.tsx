import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Star, Search } from 'lucide-react'
import { getPitchTemplates, updateSenderProfile } from '@/actions/pitch-templates'
import { TemplateCardActions } from './_components/TemplateCardActions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TONE_OPTIONS, TONE_LABELS, ToneOption } from '@/lib/pitch/tone-config'
import { CHANNEL_LABELS, ChannelOption } from '@/lib/pitch/channel-config'
import { getSenderProfile, senderProfileIncomplete } from '@/lib/outreach/sender-profile'

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
  const sender = await getSenderProfile()
  const senderMissing = senderProfileIncomplete(sender)

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

      {/* Perfil do remetente — alimenta {{meu_nome}}, {{meu_whatsapp}}, etc. */}
      <Card data-testid="sender-profile">
        <CardHeader>
          <CardTitle className="text-base">
            Seu perfil de remetente {senderMissing && <span className="ml-2 text-xs font-normal text-destructive">configure seu WhatsApp para os templates funcionarem</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={async (formData: FormData) => { 'use server'; await updateSenderProfile(formData) }} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="sp-name" className="text-xs">Seu nome <span className="text-muted-foreground">{'{{meu_nome}}'}</span></Label>
              <Input id="sp-name" name="name" defaultValue={sender.name} placeholder="Pedro Corgnati" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-company" className="text-xs">Sua empresa <span className="text-muted-foreground">{'{{minha_empresa}}'}</span></Label>
              <Input id="sp-company" name="company" defaultValue={sender.company} placeholder="Corgnati Tech" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-whatsapp" className="text-xs">Seu WhatsApp <span className="text-muted-foreground">{'{{meu_whatsapp}}'}</span></Label>
              <Input id="sp-whatsapp" name="whatsapp" defaultValue={sender.whatsapp} placeholder="(12) 99999-9999" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-portfolio" className="text-xs">Seu portfólio <span className="text-muted-foreground">{'{{meu_portfolio}}'}</span></Label>
              <Input id="sp-portfolio" name="portfolio" defaultValue={sender.portfolio} placeholder="corgnati.com" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" size="sm">Salvar perfil</Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{CHANNEL_LABELS[(t.channel ?? 'email') as ChannelOption] ?? t.channel}</Badge>
                  <Badge variant="outline">{TONE_LABELS[t.tone as ToneOption] ?? t.tone}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-3 text-sm text-muted-foreground">{t.content}</p>
                <div className="flex gap-2">
                  <Link href={`/templates/pitch/${t.id}`} className="flex-1">
                    <Button variant="secondary" className="w-full" size="sm">
                      Editar
                    </Button>
                  </Link>
                  <TemplateCardActions templateId={t.id} templateName={t.name} />
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
