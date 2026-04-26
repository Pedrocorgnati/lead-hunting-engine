'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ui/modal'
import { ReauthDialog } from '@/components/auth/ReauthDialog'
import { requestAccountDeletion } from '@/actions/profile'
import { formatDate } from '@/lib/utils/format'

interface DeletionRequestSectionProps {
  deletionRequestedAt: string | null
}

export function DeletionRequestSection({ deletionRequestedAt }: DeletionRequestSectionProps) {
  const [open, setOpen] = useState(false)
  const [reauthOpen, setReauthOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [requested, setRequested] = useState(!!deletionRequestedAt)

  async function handleConfirm() {
    setLoading(true)
    try {
      await requestAccountDeletion()
      setOpen(false)
      toast.success('Solicitação registrada. Sua conta será excluída em até 15 dias.')
      setRequested(true)
    } catch {
      setOpen(false)
      toast.error('Erro ao solicitar exclusão.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section data-testid="perfil-danger-zone" className="rounded-lg border border-destructive/20 bg-card p-6 space-y-3">
      <h2 className="text-lg font-semibold text-destructive">Excluir conta</h2>

      {requested ? (
        <div className="text-sm text-muted-foreground space-y-2" role="status">
          <p>Solicitação de exclusão registrada.</p>
          <p>
            Sua conta e todos os seus dados serão removidos em até 15 dias,
            conforme a LGPD Art. 18.
          </p>
          {deletionRequestedAt && (
            <p className="text-xs mt-2">
              Data da solicitação: {formatDate(deletionRequestedAt)}
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Ao solicitar a exclusão, sua conta e todos os seus dados (leads, coletas, templates)
            serão permanentemente removidos em até 15 dias, conforme a LGPD Art. 18.
          </p>
          <Button
            variant="destructive"
            size="sm"
            data-testid="perfil-delete-account-button"
            onClick={() => setReauthOpen(true)}
          >
            Solicitar exclusão de conta
          </Button>
        </>
      )}

      {/* TASK-18/ST003 (CL-043): re-autenticacao antes do confirm */}
      <ReauthDialog
        open={reauthOpen}
        title="Confirme sua identidade"
        description="Para solicitar a exclusão da conta, digite sua senha atual."
        onClose={() => setReauthOpen(false)}
        onSuccess={() => {
          setReauthOpen(false)
          setOpen(true)
        }}
      />

      <ConfirmationDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title="Confirmar exclusão de conta"
        description="Esta ação não pode ser desfeita. Sua conta e todos os seus dados serão excluídos em até 15 dias. Tem certeza?"
        confirmLabel="Sim, solicitar exclusão"
        cancelLabel="Cancelar"
        variant="destructive"
        loading={loading}
      />
    </section>
  )
}
