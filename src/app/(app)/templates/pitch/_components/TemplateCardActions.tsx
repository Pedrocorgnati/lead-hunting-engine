'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { deletePitchTemplate, duplicatePitchTemplate } from '@/actions/pitch-templates'

/**
 * Acoes duplicar/remover do card de template (A19).
 *
 * Client island: remover passa por ConfirmDialog (G6) e ambos dao feedback
 * de sucesso/falha via toast (as server actions retornam {success, error} —
 * antes a falha era silenciosa).
 */
export function TemplateCardActions({ templateId, templateName }: { templateId: string; templateName: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicatePitchTemplate(templateId)
      if (result?.success === false) {
        toast.error(result.error ?? 'Erro ao duplicar template.')
        return
      }
      toast.success(`Template "${templateName}" duplicado.`)
      router.refresh()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deletePitchTemplate(templateId)
      setConfirmOpen(false)
      if (result?.success === false) {
        toast.error(result.error ?? 'Erro ao remover template.')
        return
      }
      toast.success(`Template "${templateName}" removido.`)
      router.refresh()
    })
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        type="button"
        title="Duplicar"
        disabled={pending}
        onClick={handleDuplicate}
        data-testid={`template-duplicate-${templateId}`}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </Button>
      <Button
        variant="outline"
        size="sm"
        type="button"
        title="Remover"
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
        className="text-destructive hover:bg-destructive/10"
        data-testid={`template-delete-${templateId}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remover template?"
        description={`O template "${templateName}" e seu historico de versoes serao removidos permanentemente.`}
        confirmLabel="Remover"
        danger
        loading={pending}
        onConfirm={handleDelete}
      />
    </>
  )
}
