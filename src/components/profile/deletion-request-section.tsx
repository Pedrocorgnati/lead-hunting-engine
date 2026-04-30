'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ui/modal'
import { ReauthDialog } from '@/components/auth/ReauthDialog'
import { requestAccountDeletion, cancelAccountDeletion } from '@/actions/profile'
import { formatDate } from '@/lib/utils/format'
import { DELETION_CANCEL_WINDOW_DAYS } from '@/lib/constants/profile'

interface DeletionRequestSectionProps {
  deletionRequestedAt: string | null
}

export function DeletionRequestSection({ deletionRequestedAt }: DeletionRequestSectionProps) {
  const [open, setOpen] = useState(false)
  const [reauthOpen, setReauthOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [requestedAt, setRequestedAt] = useState<string | null>(deletionRequestedAt)
  const requested = !!requestedAt

  // M3-G01: countdown de dias restantes na janela de 15 dias
  const daysRemaining = useMemo(() => {
    if (!requestedAt) return null
    const requested = new Date(requestedAt).getTime()
    const elapsedMs = Date.now() - requested
    const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000))
    return Math.max(0, DELETION_CANCEL_WINDOW_DAYS - elapsedDays)
  }, [requestedAt])

  const canCancel = daysRemaining !== null && daysRemaining > 0

  async function handleConfirm() {
    setLoading(true)
    try {
      await requestAccountDeletion()
      setOpen(false)
      toast.success('Solicitação registrada. Sua conta será excluída em até 15 dias.')
      setRequestedAt(new Date().toISOString())
    } catch {
      setOpen(false)
      toast.error('Erro ao solicitar exclusão.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setCancelLoading(true)
    try {
      await cancelAccountDeletion()
      setCancelOpen(false)
      toast.success('Solicitação de exclusão cancelada. Sua conta permanece ativa.')
      setRequestedAt(null)
    } catch (err) {
      setCancelOpen(false)
      const message = err instanceof Error ? err.message : 'Erro ao cancelar solicitação.'
      toast.error(message)
    } finally {
      setCancelLoading(false)
    }
  }

  return (
    <section data-testid="perfil-danger-zone" className="rounded-lg border border-destructive/20 bg-card p-6 space-y-3">
      <h2 className="text-lg font-semibold text-destructive">Excluir conta</h2>

      {requested ? (
        <div className="text-sm text-muted-foreground space-y-3" role="status">
          <p>Solicitação de exclusão registrada.</p>
          <p>
            Sua conta e todos os seus dados serão removidos em até 15 dias,
            conforme a LGPD Art. 18.
          </p>
          {requestedAt && (
            <p className="text-xs">
              Data da solicitação: {formatDate(requestedAt)}
            </p>
          )}
          {daysRemaining !== null && (
            <p
              className="text-xs font-medium"
              data-testid="perfil-deletion-days-remaining"
            >
              {daysRemaining > 0
                ? `Você ainda tem ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'} para cancelar esta solicitação.`
                : 'A janela de 15 dias para cancelamento expirou.'}
            </p>
          )}
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              data-testid="perfil-cancel-deletion-button"
              onClick={() => setCancelOpen(true)}
            >
              Cancelar solicitação de exclusão
            </Button>
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

      {/* M3-G01: confirm dialog do cancelamento (variant default, nao-destrutivo) */}
      <ConfirmationDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title="Manter sua conta ativa?"
        description="Ao confirmar, sua solicitação de exclusão será cancelada e sua conta permanecerá ativa."
        confirmLabel="Sim, manter conta ativa"
        cancelLabel="Voltar"
        variant="default"
        loading={cancelLoading}
      />
    </section>
  )
}
