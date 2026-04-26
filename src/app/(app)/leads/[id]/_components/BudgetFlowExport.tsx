'use client'

import { useState } from 'react'
import { Copy, Download, Check, Loader2, FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BudgetFlowExportProps {
  leadId: string
  leadName: string
}

/**
 * UI de exportacao BudgetFlow (TASK-11 ST003).
 * - Fetch do JSON via /api/v1/leads/:id/export/budgetflow
 * - Botao Copiar (clipboard) — CL-214
 * - Botao Baixar JSON — CL-124
 */
export function BudgetFlowExport({ leadId, leadName }: BudgetFlowExportProps) {
  const [loading, setLoading] = useState<'copy' | 'download' | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchPayload(): Promise<string | null> {
    setError(null)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/export/budgetflow`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) {
        setError(`Falha ao gerar payload (HTTP ${res.status})`)
        return null
      }
      return await res.text()
    } catch (e) {
      setError((e as Error).message || 'Erro de rede')
      return null
    }
  }

  async function handleCopy() {
    setLoading('copy')
    try {
      const body = await fetchPayload()
      if (!body) return
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } finally {
      setLoading(null)
    }
  }

  async function handleDownload() {
    setLoading('download')
    try {
      const body = await fetchPayload()
      if (!body) return
      const blob = new Blob([body], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const slug = leadName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'lead'
      a.href = url
      a.download = `budgetflow-${slug}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(null)
    }
  }

  return (
    <Card data-testid="budgetflow-export-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileJson className="h-4 w-4" aria-hidden="true" />
          Enviar ao BudgetFlow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Gere o payload canônico deste lead para importação na ferramenta BudgetFlow.
          O JSON exclui campos internos e PII sensível conforme LGPD.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleCopy}
            disabled={loading !== null}
            data-testid="budgetflow-copy-button"
            variant={copied ? 'secondary' : 'default'}
          >
            {loading === 'copy' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : copied ? (
              <Check className="h-4 w-4 mr-2" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            {copied ? 'Copiado!' : 'Copiar JSON'}
          </Button>
          <Button
            onClick={handleDownload}
            disabled={loading !== null}
            variant="outline"
            data-testid="budgetflow-download-button"
          >
            {loading === 'download' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            Baixar JSON
          </Button>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert" data-testid="budgetflow-export-error">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
