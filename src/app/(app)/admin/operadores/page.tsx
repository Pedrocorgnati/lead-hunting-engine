'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Eye, Loader2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface Operator {
  id: string
  name: string | null
  email: string
  role: string
  createdAt: string
  lastActiveAt?: string | null
}

interface UsersResponse {
  data?: Operator[]
  meta?: { total: number }
  error?: { code: string; message: string }
}

export default function OperadoresPage() {
  const [operators, setOperators] = useState<Operator[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/v1/admin/users?role=OPERATOR&limit=100')
      const json = (await res.json().catch(() => ({}))) as UsersResponse
      if (!res.ok) {
        const msg = json.error?.message ?? 'Erro ao carregar operadores.'
        setError(msg)
        toast.error(msg)
        return
      }
      setOperators(json.data ?? [])
      setTotal(json.meta?.total ?? 0)
    } catch {
      const msg = 'Erro de rede.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6 p-6" data-testid="operadores-list-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Operadores</h1>
          {!loading && (
            <p className="text-sm text-muted-foreground" data-testid="operadores-total">
              {total} operador(es)
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} data-testid="reload-btn">
          Atualizar
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-12" aria-label="Carregando operadores...">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {!loading && !error && operators.length === 0 && (
        <div role="status" className="text-center py-12">
          <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Nenhum operador encontrado.</p>
        </div>
      )}

      {!loading && !error && operators.length > 0 && (
        <div className="space-y-3">
          {operators.map((op) => (
            <Card key={op.id} data-testid={`operator-${op.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-medium">{op.name ?? op.email}</CardTitle>
                    <p className="text-xs text-muted-foreground">{op.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{op.role}</Badge>
                    <Link
                      href={`/admin/operadores/${op.id}`}
                      data-testid={`operator-view-${op.id}`}
                      className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-medium hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                      Ver detalhes
                    </Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  Membro desde {new Date(op.createdAt).toLocaleDateString('pt-BR')}
                  {op.lastActiveAt && ` · Ativo em ${new Date(op.lastActiveAt).toLocaleDateString('pt-BR')}`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
