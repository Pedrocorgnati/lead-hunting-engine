import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createPitchTemplate } from '@/actions/pitch-templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TONE_OPTIONS, TONE_LABELS } from '@/lib/pitch/tone-config'
import { CHANNEL_OPTIONS, CHANNEL_LABELS } from '@/lib/pitch/channel-config'
import { TEMPLATE_PLACEHOLDERS } from '@/lib/pitch/template-vars'

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
          <Input id="name" name="name" placeholder="Ex: E-mail sem site — clínicas" required />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="channel">Canal</Label>
            <select id="channel" name="channel" className="w-full rounded-md border bg-background px-3 py-2 text-sm" defaultValue="email">
              {CHANNEL_OPTIONS.map((c) => (
                <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tone">Tom</Label>
            <select id="tone" name="tone" className="w-full rounded-md border bg-background px-3 py-2 text-sm" defaultValue="formal">
              {TONE_OPTIONS.map((tone) => (
                <option key={tone} value={tone}>{TONE_LABELS[tone] ?? tone}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">Assunto <span className="text-xs text-muted-foreground">(só para e-mail)</span></Label>
          <Input id="subject" name="subject" placeholder="Ex: {{empresa}} no Google" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">Conteúdo</Label>
          <Textarea
            id="content"
            name="content"
            rows={10}
            placeholder={'Olá, pessoal da {{empresa}}!\nEncontrei vocês procurando {{segmento}} em {{cidade}}. Notei que {{problema}}...\n— {{meu_nome}}, {{meu_whatsapp}}'}
            required
          />
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Placeholders disponíveis (substituídos no envio):</p>
            <p className="mt-1"><strong>Do lead:</strong> {TEMPLATE_PLACEHOLDERS.filter((p) => p.group === 'lead').map((p) => `{{${p.key}}}`).join(' · ')}</p>
            <p className="mt-0.5"><strong>Seus (perfil de remetente):</strong> {TEMPLATE_PLACEHOLDERS.filter((p) => p.group === 'remetente').map((p) => `{{${p.key}}}`).join(' · ')}</p>
          </div>
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
