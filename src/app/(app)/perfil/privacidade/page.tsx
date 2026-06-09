'use client'

/**
 * TASK-4/A3 (P0): Tela A26 /perfil/privacidade.
 *
 * Centro DSAR do titular. Consome o contrato explicito da task:
 * - GET  /api/v1/profile/dsar/requests
 * - POST /api/v1/profile/dsar/export-request
 * - GET  /api/v1/profile/dsar/:requestId/download
 * - POST /api/v1/profile/deletion-request
 * - POST /api/v1/profile/deletion-request/cancel
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileArchive, Loader2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils/format'

type DsarRequestType = 'EXPORT' | 'DELETION'
type DsarRequestStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'FAILED'

interface DsarRequest {
  requestId: string
  type: DsarRequestType
  requestedAt: string
  status: DsarRequestStatus
  completedAt: string | null
  downloadUrl?: string
  cancelAllowed?: boolean
}

const DELETION_CONFIRM_PHRASE = 'EXCLUIR'

const statusLabels: Record<DsarRequestStatus, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Em andamento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  FAILED: 'Falhou',
}

const statusVariants: Record<DsarRequestStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  PROCESSING: 'outline',
  COMPLETED: 'default',
  CANCELLED: 'secondary',
  FAILED: 'destructive',
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const json = await response.json()
    return json?.error?.message ?? json?.message ?? fallback
  } catch {
    return fallback
  }
}

async function downloadAttachment(url: string, fallbackName: string): Promise<void> {
  const response = await fetch(url, { method: 'GET' })
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Não foi possível baixar o comprovante.'))
  }

  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] ?? fallbackName

  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

function RequestSkeleton() {
  return (
    <div
      className="space-y-3 rounded-lg border bg-card p-4"
      aria-busy="true"
      aria-label="Carregando histórico de solicitações"
      role="status"
    >
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-9 w-32" />
    </div>
  )
}

function typeLabel(type: DsarRequestType) {
  return type === 'EXPORT' ? 'Exportação de dados' : 'Exclusão de conta'
}

export default function PerfilPrivacidadePage() {
  const [requests, setRequests] = useState<DsarRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deletePhrase, setDeletePhrase] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [canceling, setCanceling] = useState(false)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const response = await fetch('/api/v1/profile/dsar/requests', {
        method: 'GET',
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Não foi possível carregar o histórico DSAR.'))
      }
      const json = await response.json()
      setRequests((json?.data?.requests ?? []) as DsarRequest[])
    } catch (error) {
      setLoadError(true)
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o histórico DSAR.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  const activeDeletion = useMemo(
    () =>
      requests.find(
        (request) =>
          request.type === 'DELETION' &&
          (request.status === 'PENDING' || request.status === 'PROCESSING'),
      ) ?? null,
    [requests],
  )
  const canCancelDeletion = Boolean(activeDeletion)
  const phraseMatches = deletePhrase.trim() === DELETION_CONFIRM_PHRASE

  async function handleExportRequest() {
    setExporting(true)
    try {
      const response = await fetch('/api/v1/profile/dsar/export-request', { method: 'POST' })
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Não foi possível solicitar a exportação.'))
      }
      const json = await response.json()
      const request = json?.data?.request as DsarRequest | undefined
      toast.success('Solicitação de exportação registrada.')
      await loadRequests()
      if (request?.downloadUrl) {
        await handleDownload(request)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível solicitar a exportação.')
    } finally {
      setExporting(false)
    }
  }

  async function handleDownload(request: DsarRequest) {
    if (!request.downloadUrl) {
      toast.error('Download indisponível para esta solicitação.')
      return
    }

    setDownloadingId(request.requestId)
    try {
      await downloadAttachment(request.downloadUrl, `dsar-${request.requestId}.json`)
      toast.success('Download iniciado.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível baixar o arquivo.')
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleRequestDeletion() {
    setDeleting(true)
    try {
      const response = await fetch('/api/v1/profile/deletion-request', { method: 'POST' })
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Não foi possível solicitar a exclusão.'))
      }
      setConfirmOpen(false)
      setDeletePhrase('')
      toast.success('Solicitação de exclusão registrada.')
      await loadRequests()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível solicitar a exclusão.')
    } finally {
      setDeleting(false)
    }
  }

  async function handleCancelDeletion() {
    setCanceling(true)
    try {
      const response = await fetch('/api/v1/profile/deletion-request/cancel', { method: 'POST' })
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Não foi possível cancelar a exclusão.'))
      }
      setCancelOpen(false)
      toast.success('Solicitação de exclusão cancelada.')
      await loadRequests()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível cancelar a exclusão.')
    } finally {
      setCanceling(false)
    }
  }

  return (
    <div data-testid="perfil-privacidade-page" className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Privacidade e seus dados</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Solicite exportação, acompanhe histórico LGPD e gerencie a exclusão da conta sem
          depender da página genérica de perfil.
        </p>
      </header>

      <section
        data-testid="perfil-privacidade-actions"
        className="grid gap-4 md:grid-cols-[1fr_1fr]"
      >
        <div className="space-y-3 rounded-lg border bg-card p-5">
          <div className="flex items-start gap-3">
            <FileArchive className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">Exportar dados pessoais</h2>
              <p className="text-sm text-muted-foreground">
                Registra a solicitação DSAR e libera um comprovante para download quando concluída.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleExportRequest}
            disabled={exporting}
            data-testid="perfil-privacidade-export-request-button"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            {exporting ? 'Solicitando...' : 'Solicitar exportação'}
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border border-destructive/20 bg-card p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" aria-hidden />
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">Excluir conta</h2>
              <p className="text-sm text-muted-foreground">
                A solicitação exige confirmação forte com a frase EXCLUIR e pode ser cancelada
                enquanto estiver pendente ou em processamento.
              </p>
            </div>
          </div>

          {activeDeletion ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariants[activeDeletion.status]}>
                {statusLabels[activeDeletion.status]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Solicitada em {formatDate(activeDeletion.requestedAt)}
              </span>
              {canCancelDeletion && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                  data-testid="perfil-privacidade-cancel-deletion-button"
                >
                  <XCircle className="h-4 w-4" aria-hidden />
                  Cancelar solicitação
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="delete-confirm-phrase">
                  Digite <span className="font-mono font-semibold">EXCLUIR</span> para confirmar
                </Label>
                <Input
                  id="delete-confirm-phrase"
                  value={deletePhrase}
                  onChange={(event) => setDeletePhrase(event.target.value)}
                  placeholder="EXCLUIR"
                  autoComplete="off"
                  data-testid="perfil-privacidade-delete-phrase-input"
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!phraseMatches}
                onClick={() => setConfirmOpen(true)}
                data-testid="perfil-privacidade-delete-button"
              >
                Solicitar exclusão
              </Button>
            </div>
          )}
        </div>
      </section>

      <section data-testid="perfil-privacidade-history" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Histórico LGPD</h2>
            <p className="text-sm text-muted-foreground">
              Cada registro expõe requestId, tipo, data, status, conclusão e comprovante quando disponível.
            </p>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={loadRequests} aria-label="Atualizar histórico">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        {loading ? (
          <>
            <RequestSkeleton />
            <RequestSkeleton />
          </>
        ) : loadError ? (
          <div className="space-y-3 rounded-lg border bg-card p-5">
            <InlineAlert
              variant="error"
              title="Histórico indisponível"
              message="Não foi possível carregar suas solicitações LGPD."
            />
            <Button type="button" variant="outline" size="sm" onClick={loadRequests}>
              Tentar novamente
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-lg border bg-card p-5">
            <InlineAlert
              variant="info"
              title="Nenhuma solicitação registrada"
              message="Quando você solicitar exportação ou exclusão, o histórico aparecerá aqui."
            />
          </div>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {requests.map((request) => (
              <article
                key={request.requestId}
                className="grid gap-3 p-4 md:grid-cols-[1fr_auto]"
                data-testid={`perfil-privacidade-request-${request.requestId}`}
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{typeLabel(request.type)}</h3>
                    <Badge variant={statusVariants[request.status]}>
                      {statusLabels[request.status]}
                    </Badge>
                  </div>
                  <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-foreground">requestId</dt>
                      <dd className="break-all font-mono">{request.requestId}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">type</dt>
                      <dd>{request.type}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">requestedAt</dt>
                      <dd>{formatDate(request.requestedAt)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">completedAt</dt>
                      <dd>{request.completedAt ? formatDate(request.completedAt) : '-'}</dd>
                    </div>
                  </dl>
                </div>

                {request.downloadUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(request)}
                    disabled={downloadingId === request.requestId}
                    data-testid={`perfil-privacidade-download-${request.requestId}`}
                  >
                    {downloadingId === request.requestId ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden />
                    )}
                    Baixar comprovante
                  </Button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <ConfirmationDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRequestDeletion}
        title="Confirmar exclusão de conta"
        description="Esta solicitação inicia a remoção permanente da conta e dos dados pessoais. Ela pode ser cancelada enquanto estiver pendente ou em processamento."
        confirmLabel="Sim, solicitar exclusão"
        cancelLabel="Voltar"
        variant="destructive"
        loading={deleting}
      />

      <ConfirmationDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancelDeletion}
        title="Cancelar solicitação de exclusão?"
        description="A conta permanecerá ativa e o cancelamento será registrado no histórico LGPD."
        confirmLabel="Sim, cancelar exclusão"
        cancelLabel="Voltar"
        loading={canceling}
      />
    </div>
  )
}
