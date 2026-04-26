'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ExportButtonProps {
  filters?: Record<string, string | undefined>
}

export function ExportButton({ filters = {} }: ExportButtonProps) {
  const [busy, setBusy] = useState(false)

  async function triggerDownload(format: 'csv' | 'json') {
    setBusy(true)
    try {
      const params = new URLSearchParams({ format })
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v)
      })
      window.location.href = `/api/v1/leads/export?${params.toString()}`
    } finally {
      setTimeout(() => setBusy(false), 1000)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(props) => (
          <Button {...props} variant="outline" size="sm" disabled={busy}>
            <Download className="h-4 w-4" />
            Exportar
          </Button>
        )}
      />

      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => triggerDownload('csv')}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => triggerDownload('json')}>JSON</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
