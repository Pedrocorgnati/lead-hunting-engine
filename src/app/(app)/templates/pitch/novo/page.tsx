import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createPitchTemplate } from '@/actions/pitch-templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TONE_OPTIONS, TONE_LABELS } from '@/lib/pitch/tone-config'

export const metadata: Metadata = {
  title: 'Novo template de pitch',
}

export default function NovoTemplatePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Link href="/templates/pitch">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Novo template de pitch</h1>
        <p className="text-sm text-muted-foreground">
          Crie um template reutilizável para seus pitches.
        </p>
      </div>

      <form action={async (formData: FormData) => { 'use server'; await createPitchTemplate(formData) }} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" placeholder="Ex: Pitch formal para imobiliária" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tone">Tom</Label>
          <select
            id="tone"
            name="tone"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            defaultValue="formal"
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
            placeholder="Escreva o conteúdo do pitch. Use {{nome}}, {{empresa}}, {{segmento}} como placeholders."
            required
          />
          <p className="text-xs text-muted-foreground">
            Dica: use {'{{nome}}'}, {'{{empresa}}'}, {'{{segmento}}'} como placeholders que serão substituídos ao aplicar o pitch.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input id="isFavorite" name="isFavorite" type="checkbox" value="true" className="h-4 w-4" />
          <Label htmlFor="isFavorite" className="text-sm font-normal">
            Definir como template favorito
          </Label>
        </div>

        <div className="flex gap-2">
          <Button type="submit">Salvar template</Button>
          <Link href="/templates/pitch">
            <Button variant="outline" type="button">
              Cancelar
            </Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
