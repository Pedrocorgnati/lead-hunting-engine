'use client'

import { useState } from 'react'
import { FlaskConical, Pencil, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmationDialog } from '@/components/ui/modal'
import { useToast } from '@/lib/hooks/use-toast'
import { CREDENTIAL_PROVIDER_MAP } from '@/lib/constants/enums'
import type { CredentialDto } from '@/actions/config'

interface CredentialCardProps {
  cred: CredentialDto
  onEdit: (cred: CredentialDto) => void
  onDelete: (id: string) => Promise<void>
  onTest: (id: string) => Promise<{ success: boolean; message: string }>
  onToggleActive: (id: string, isActive: boolean) => Promise<void>
}

export function CredentialCard({ cred, onEdit, onDelete, onTest, onToggleActive }: CredentialCardProps) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const toast = useToast()

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await onTest(cred.id)
      setTestResult(result)
    } catch {
      setTestResult({ success: false, message: 'Erro ao testar credencial.' })
    }
    setTesting(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(cred.id)
      toast.success('Credencial excluída.')
      setDeleteOpen(false)
    } catch {
      toast.error('Erro ao excluir credencial.')
    }
    setDeleting(false)
  }

  const handleToggle = async () => {
    setToggling(true)
    try {
      await onToggleActive(cred.id, !cred.isActive)
      toast.success(cred.isActive ? 'Credencial desativada.' : 'Credencial ativada.')
    } catch {
      toast.error('Erro ao alterar status da credencial.')
    }
    setToggling(false)
  }

  return (
    <>
      <div
        data-testid={`credential-card-${cred.id}`}
        className={cn('rounded-lg border bg-card p-4 space-y-3', !cred.isActive && 'opacity-60')}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-foreground">{cred.label}</p>
              <Badge variant="outline" className="text-xs">
                {CREDENTIAL_PROVIDER_MAP[cred.provider]?.label ?? cred.provider}
              </Badge>
              {!cred.isActive && <Badge variant="secondary" className="text-xs">Inativa</Badge>}
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-1">{cred.maskedValue}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              data-testid={`test-btn-${cred.id}`}
              onClick={handleTest}
              disabled={testing}
              aria-label={`Testar credencial ${cred.label}`}
              aria-busy={testing}
              className="h-11 w-11 p-0 md:h-8 md:w-8"
            >
              {testing ? (
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              ) : (
                <FlaskConical className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-testid={`edit-btn-${cred.id}`}
              onClick={() => onEdit(cred)}
              aria-label={`Editar credencial ${cred.label}`}
              className="h-11 w-11 p-0 md:h-8 md:w-8"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-testid={`toggle-btn-${cred.id}`}
              onClick={handleToggle}
              disabled={toggling}
              aria-label={cred.isActive ? `Desativar credencial ${cred.label}` : `Ativar credencial ${cred.label}`}
              className="h-11 w-11 p-0 md:h-8 md:w-8"
            >
              <span className={cn(
                'h-3 w-3 rounded-full',
                cred.isActive ? 'bg-success' : 'bg-muted-foreground'
              )} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-testid={`delete-btn-${cred.id}`}
              onClick={() => setDeleteOpen(true)}
              aria-label={`Excluir credencial ${cred.label}`}
              className="h-11 w-11 p-0 md:h-8 md:w-8 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {testResult && (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-xs',
              testResult.success
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            )}
          >
            {testResult.success
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              : <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            }
            {testResult.message}
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Excluir credencial"
        description={`Tem certeza que deseja excluir a credencial "${cred.label}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        loading={deleting}
      />
    </>
  )
}
