'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

const BudgetFlowSchema = z.object({
  campaignId: z.string().trim().min(1, 'ID da campanha obrigatorio'),
  budget: z.string().min(1),
  currency: z.enum(['BRL', 'USD', 'EUR']),
  note: z.string().max(500).optional(),
})
type FormData = z.infer<typeof BudgetFlowSchema>

type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export default function BudgetFlowPage() {
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(BudgetFlowSchema),
    defaultValues: { currency: 'BRL' },
  })

  async function checkStatus(id: string) {
    try {
      const res = await fetch(`/api/v1/integrations/budgetflow/status?id=${encodeURIComponent(id)}`)
      if (!res.ok) return
      const body = await res.json() as {data?:{status:JobStatus}}
      setJobStatus(body.data?.status ?? null)
    } catch { /* silencioso */ }
  }

  async function onSubmit(data: FormData) {
    setError(null)
    setJobId(null)
    setJobStatus(null)
    try {
      // Pre-validacao
      const valRes = await fetch('/api/v1/integrations/budgetflow/validate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!valRes.ok) {
        const body = (await valRes.json().catch(() => ({}))) as {error?:{message?:string}}
        setError(body?.error?.message ?? 'Erro de validacao.')
        toast.error(body?.error?.message ?? 'Erro de validacao.')
        return
      }

      const res = await fetch('/api/v1/integrations/budgetflow/push', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {error?:{message?:string}}
        setError(body?.error?.message ?? 'Erro ao enviar BudgetFlow.')
        toast.error(body?.error?.message ?? 'Erro.')
        return
      }
      const pushBody = await res.json() as {data?:{jobId?:string;status?:JobStatus}}
      const newJobId = pushBody.data?.jobId ?? null
      setJobId(newJobId)
      setJobStatus(pushBody.data?.status ?? 'PENDING')
      setSuccess(true)
      toast.success('BudgetFlow enviado com sucesso.')
      if (newJobId) {
        const interval = setInterval(() => checkStatus(newJobId), 2000)
        setTimeout(() => clearInterval(interval), 15000)
      }
    } catch { setError('Erro de rede.'); toast.error('Erro de rede.') }
  }

  if (success) return (
    <div className="p-6 flex flex-col items-center gap-4 max-w-2xl mx-auto">
      <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden="true" />
      <p className="text-sm font-medium">BudgetFlow enviado com sucesso!</p>
      {jobId && (
        <div className="text-xs text-muted-foreground space-y-1 text-center">
          <p>Job: <code className="bg-muted px-1 rounded">{jobId}</code></p>
          <p>Status: <span className="font-medium">{jobStatus ?? '—'}</span></p>
        </div>
      )}
      <Button variant="outline" onClick={() => { setSuccess(false); setJobId(null); setJobStatus(null); }}>Novo envio</Button>
    </div>
  )

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <div><h1 className="text-2xl font-semibold">BudgetFlow</h1><p className="text-sm text-muted-foreground">Envie orcamento para campanha via fluxo dedicado.</p></div>
      <Card>
        <CardHeader><CardTitle>Dados do envio</CardTitle><CardDescription>Preencha o payload para o push BudgetFlow.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1"><Label htmlFor="campaignId">ID da campanha</Label>
              <Input id="campaignId" disabled={isSubmitting} {...register('campaignId')} />
              {errors.campaignId && <p role="alert" className="text-xs text-destructive">{errors.campaignId.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="budget">Orcamento</Label>
                <Input id="budget" type="text" disabled={isSubmitting} {...register('budget')} />
                {errors.budget && <p role="alert" className="text-xs text-destructive">{errors.budget.message}</p>}
              </div>
              <div className="space-y-1"><Label htmlFor="currency">Moeda</Label>
                <select id="currency" {...register('currency')} disabled={isSubmitting} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="BRL">BRL</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div className="space-y-1"><Label htmlFor="note">Nota (opcional)</Label>
              <textarea id="note" disabled={isSubmitting} {...register('note')} rows={3} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Observacoes sobre o orcamento..." />
              {errors.note && <p role="alert" className="text-xs text-destructive">{errors.note.message}</p>}
            </div>
            {error && <div role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" aria-hidden="true" />{error}</div>}
            <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />}<Send className="h-4 w-4 mr-2" aria-hidden />Enviar BudgetFlow</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
