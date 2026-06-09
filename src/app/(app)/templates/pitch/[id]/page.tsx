import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Star, History } from 'lucide-react'
import {
  getPitchTemplate,
  getPitchTemplateVersions,
  restorePitchTemplateVersion,
  updatePitchTemplate,
} from '@/actions/pitch-templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TONE_OPTIONS, TONE_LABELS, ToneOption } from '@/lib/pitch/tone-config'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const template = await getPitchTemplate(id)
  return { title: template ? `Editar: ${template.name}` : 'Template não encontrado' }
}

function PreviewPanel({ content }: { content: string }) {
  const sample = {
    nome: 'João Silva',
    empresa: 'Acme Corp',
    segmento: 'Tecnologia',
  }
  let preview = content
  Object.entries(sample).forEach(([key, value]) => {
    preview = preview.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), value)
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{preview}</p>
      </CardContent>
    </Card>
  )
}

export default async function EditarTemplatePage({ params }: PageProps) {
  const { id } = await params
  const template = await getPitchTemplate(id)
  if (!template) notFound()

  const { data: versions } = await getPitchTemplateVersions(id, 1, 5)

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Link href="/templates/pitch">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{template.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline">{TONE_LABELS[template.tone as ToneOption] ?? template.tone}</Badge>
            {template.isFavorite && (
              <span className="inline-flex items-center gap-1 text-xs text-yellow-600">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                Favorito
              </span>
            )}
          </div>
        </div>
      </div>

      <form action={async (formData: FormData) => {
        'use server'
        await updatePitchTemplate(id, formData)
      }} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" defaultValue={template.name} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tone">Tom</Label>
          <select
            id="tone"
            name="tone"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            defaultValue={template.tone}
          >
            {TONE_OPTIONS.map((tone) => (
              <option key={tone} value={tone}>
                {TONE_LABELS[tone] ?? tone}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">Conteúdo</Label>
          <Textarea
            id="content"
            name="content"
            rows={10}
            defaultValue={template.content}
            required
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="isFavorite"
            name="isFavorite"
            type="checkbox"
            value="true"
            defaultChecked={template.isFavorite}
            className="h-4 w-4"
          />
          <Label htmlFor="isFavorite" className="text-sm font-normal">
            Template favorito
          </Label>
        </div>

        <div className="flex gap-2">
          <Button type="submit">Salvar alterações</Button>
          <Link href="/templates/pitch">
            <Button variant="outline" type="button">
              Cancelar
            </Button>
          </Link>
        </div>
      </form>

      <PreviewPanel content={template.content} />

      {versions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Versões recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{v.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <form
                    action={async () => {
                      'use server'
                      await restorePitchTemplateVersion(id, v.id)
                    }}
                  >
                    <Button variant="ghost" size="sm" type="submit">
                      Restaurar
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
