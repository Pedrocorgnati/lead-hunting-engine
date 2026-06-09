'use client'

/**
 * TASK-3/A2 (P0): widget reutilizavel de comprovante de consentimento LGPD.
 *
 * Projeta um `ConsentReceipt` (contrato canonico de `@/lib/consent-receipt`,
 * NAO recriado aqui) em: comprovante atual, historico resumido, download e
 * estado de revogacao. Reutilizado pela tela publica P15 (/consentimento),
 * por A26 (/perfil/privacidade) e AD26 (/admin/dsar) sem duplicar contrato.
 *
 * Acoes (download/revogar) sao injetadas pelo container — o widget e
 * apresentacional + acessivel, sem fetch proprio.
 */
import { Download, ShieldCheck, ShieldOff, History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from '@/components/ui'
import { LoadingButton } from '@/components/ui/loading-button'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils/format'
import { consentCategoryLabel } from '@/lib/constants/consent'
import type { ConsentReceipt } from '@/lib/consent-receipt'

interface ConsentReceiptWidgetProps {
  /** Comprovante atual. */
  receipt: ConsentReceipt
  /** Historico minimo (mais recentes primeiro). Opcional — A26/AD26 populam. */
  history?: ConsentReceipt[]
  /** Handler de download. Quando ausente, usa o link nativo `receipt.downloadUrl`. */
  onDownload?: () => void
  downloading?: boolean
  /** Handler de revogacao. Quando ausente, o botao nao aparece. */
  onRevoke?: () => void
  revoking?: boolean
  /** Marca o comprovante como revogado (sem categorias opcionais ativas). */
  revoked?: boolean
}

/** Hash truncado para exibicao legivel (prova de integridade). */
function shortHash(hash: string): string {
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash
}

export function ConsentReceiptWidget({
  receipt,
  history = [],
  onDownload,
  downloading = false,
  onRevoke,
  revoking = false,
  revoked = false,
}: ConsentReceiptWidgetProps) {
  const pastReceipts = history.filter((h) => h.receiptId !== receipt.receiptId)

  return (
    <Card data-testid="consent-receipt-widget" aria-labelledby="consent-receipt-title">
      <CardHeader className="border-b">
        <CardTitle id="consent-receipt-title" className="flex items-center gap-2">
          {revoked ? (
            <ShieldOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          )}
          Comprovante de consentimento
        </CardTitle>
        <CardDescription>
          {revoked
            ? 'Categorias opcionais revogadas. Apenas o essencial permanece ativo.'
            : 'Registro assinado das suas preferencias de privacidade.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Identificador
            </dt>
            <dd className="font-mono text-foreground break-all" data-testid="consent-receipt-id">
              {receipt.receiptId}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Versao da politica
            </dt>
            <dd className="text-foreground">v{receipt.policyVersion}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Aceito em
            </dt>
            <dd className="text-foreground">
              {formatDate(receipt.acceptedAt, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Integridade (SHA-256)
            </dt>
            <dd
              className="font-mono text-foreground"
              title={receipt.hash}
              data-testid="consent-receipt-hash"
            >
              {shortHash(receipt.hash)}
            </dd>
          </div>
        </dl>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Categorias consentidas
          </p>
          <ul className="flex flex-wrap gap-2" data-testid="consent-receipt-categories">
            {receipt.categories.map((cat) => (
              <li key={cat}>
                <Badge variant="secondary">{consentCategoryLabel(cat)}</Badge>
              </li>
            ))}
          </ul>
        </div>

        {pastReceipts.length > 0 && (
          <div data-testid="consent-receipt-history">
            <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              <History className="h-3 w-3" aria-hidden="true" />
              Historico recente
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {pastReceipts.slice(0, 5).map((h) => (
                <li key={h.receiptId} className="flex flex-wrap items-center gap-x-2">
                  <span>{formatDate(h.acceptedAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>v{h.policyVersion}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {h.categories.map((c) => consentCategoryLabel(c)).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {onDownload ? (
            <LoadingButton
              type="button"
              variant="outline"
              size="sm"
              loading={downloading}
              onClick={onDownload}
              data-testid="consent-receipt-download"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Baixar comprovante
            </LoadingButton>
          ) : (
            <Button
              variant="outline"
              size="sm"
              data-testid="consent-receipt-download-link"
              render={<a href={receipt.downloadUrl} download />}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Baixar comprovante
            </Button>
          )}

          {onRevoke && !revoked && (
            <LoadingButton
              type="button"
              variant="ghost"
              size="sm"
              loading={revoking}
              onClick={onRevoke}
              data-testid="consent-receipt-revoke"
            >
              <ShieldOff className="h-4 w-4" aria-hidden="true" />
              Revogar opcionais
            </LoadingButton>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
