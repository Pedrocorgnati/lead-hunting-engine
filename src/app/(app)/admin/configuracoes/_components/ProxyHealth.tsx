'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'

interface ProxyStatus {
  total: number
  healthy: number
  quarantined: Array<{ host: string; port: number; until: string }>
}

export function ProxyHealth() {
  const [status, setStatus] = useState<ProxyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/v1/admin/proxy-health')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ data: ProxyStatus }>
      })
      .then(json => {
        setStatus(json.data)
        setLoading(false)
      })
      .catch(e => {
        setError((e as Error).message)
        setLoading(false)
      })
  }, [])

  if (loading) return <p className="text-sm text-muted-foreground">Carregando proxies...</p>
  if (error) return <p className="text-sm text-destructive">Erro ao carregar proxies: {error}</p>
  if (!status) return null

  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-sm">
        <span>Total: <strong>{status.total}</strong></span>
        <span>Ativos: <Badge variant="secondary">{status.healthy}</Badge></span>
        <span>Quarentena: <Badge variant="destructive">{status.quarantined.length}</Badge></span>
      </div>

      {status.quarantined.length > 0 && (
        <div className="rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Proxies em quarentena</p>
          <ul className="space-y-1">
            {status.quarantined.map(p => (
              <li key={`${p.host}:${p.port}`} className="text-xs flex justify-between">
                <span className="font-mono">{p.host}:{p.port}</span>
                <span className="text-muted-foreground">ate {new Date(p.until).toLocaleString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
