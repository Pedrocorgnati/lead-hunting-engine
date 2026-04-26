'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'
import { createCredential, updateCredential } from '@/actions/config'
import { CredentialProvider, CREDENTIAL_PROVIDER_MAP } from '@/lib/constants/enums'

const createSchema = z.object({
  label: z.string().min(1, 'Rótulo é obrigatório.').max(100),
  provider: z.nativeEnum(CredentialProvider),
  apiKey: z.string().min(1, 'Chave de API é obrigatória.'),
})

const editSchema = z.object({
  label: z.string().min(1, 'Rótulo é obrigatório.').max(100),
  apiKey: z.string().optional(),
})

type CreateFormData = z.infer<typeof createSchema>
type EditFormData = z.infer<typeof editSchema>

interface CredentialFormProps {
  editing?: { id: string; provider: string; label: string }
  onSuccess: () => void
  onCancel: () => void
}

export function CredentialForm({ editing, onSuccess, onCancel }: CredentialFormProps) {
  const toast = useToast()
  const isEdit = !!editing

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { provider: CredentialProvider.GOOGLE_PLACES },
  })

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: { label: editing?.label ?? '', apiKey: '' },
  })

  // Unificamos apenas o que for comum (formState) — register e typed por form
  // para evitar union-of-signatures que o TS nao consegue chamar.
  const { formState: { errors, isSubmitting } } = isEdit ? editForm : createForm
  const registerLabel = isEdit ? editForm.register('label') : createForm.register('label')
  const registerApiKey = isEdit ? editForm.register('apiKey') : createForm.register('apiKey')

  const onSubmitCreate = async (data: CreateFormData) => {
    try {
      await createCredential(data)
      toast.success('Credencial adicionada.')
      onSuccess()
    } catch {
      toast.error('Erro ao adicionar credencial.')
    }
  }

  const onSubmitEdit = async (data: EditFormData) => {
    if (!editing) return
    try {
      await updateCredential(editing.id, {
        label: data.label,
        apiKey: data.apiKey || undefined,
      })
      toast.success('Credencial atualizada.')
      onSuccess()
    } catch {
      toast.error('Erro ao atualizar credencial.')
    }
  }

  return (
    <form
      data-testid="admin-config-credential-modal-form"
      onSubmit={isEdit
        ? editForm.handleSubmit(onSubmitEdit)
        : createForm.handleSubmit(onSubmitCreate)
      }
      className="space-y-4"
    >
      {!isEdit && (
        <div className="space-y-1.5">
          <Label htmlFor="cred-provider">Provedor</Label>
          <select
            id="cred-provider"
            disabled={isSubmitting}
            className="w-full h-10 px-3 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary"
            {...createForm.register('provider')}
          >
            {Object.entries(CREDENTIAL_PROVIDER_MAP).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {isEdit && (
        <div className="space-y-1.5">
          <Label>Provedor</Label>
          <p className="text-sm text-muted-foreground">
            {CREDENTIAL_PROVIDER_MAP[editing.provider as CredentialProvider]?.label ?? editing.provider}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="cred-label">Rótulo <span aria-hidden="true">*</span></Label>
        <Input
          id="cred-label"
          placeholder="Ex: Google Places Produção"
          autoFocus
          disabled={isSubmitting}
          aria-required="true"
          aria-invalid={!!errors.label}
          {...registerLabel}
        />
        {errors.label && <p role="alert" className="text-xs text-destructive">{errors.label.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cred-key">
          {isEdit ? 'Nova chave (deixe vazio para manter)' : 'Chave de API'}
          {!isEdit && <span aria-hidden="true"> *</span>}
        </Label>
        <Input
          id="cred-key"
          type="password"
          autoComplete="off"
          placeholder={isEdit ? '••••••••••••' : 'sk-...'}
          disabled={isSubmitting}
          aria-required={!isEdit ? 'true' : undefined}
          aria-invalid={!!errors.apiKey}
          {...registerApiKey}
        />
        {errors.apiKey && <p role="alert" className="text-xs text-destructive">{errors.apiKey.message}</p>}
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          data-testid="admin-config-credential-cancel-button"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          data-testid="admin-config-credential-submit-button"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting && (
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          )}
          {isSubmitting
            ? (isEdit ? 'Atualizando...' : 'Criando...')
            : (isEdit ? 'Atualizar credencial' : 'Criar credencial')
          }
        </Button>
      </div>
    </form>
  )
}
