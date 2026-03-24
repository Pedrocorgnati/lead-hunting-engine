'use client'
import { useState } from 'react'
import { LEAD_STATUS_MAP } from '@/lib/constants/enums'
import { apiClient } from '@/lib/utils/api-client'
import { useToast } from '@/lib/hooks/use-toast'
import { API_ROUTES } from '@/lib/constants/routes'

interface Props {
  leadId: string
  currentStatus: string
  onStatusChange?: (status: string) => void
}

export function LeadStatusSelect({ leadId, currentStatus, onStatusChange }: Props) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    if (newStatus === currentStatus) return
    setSaving(true)
    const res = await apiClient.patch(API_ROUTES.LEAD_STATUS(leadId), { status: newStatus })
    setSaving(false)

    if (res.error) {
      toast.error('Erro ao atualizar status.')
      return
    }

    onStatusChange?.(newStatus)
    toast.success('Status atualizado.')
  }

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      disabled={saving}
      className="rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 min-h-[44px]"
      aria-label="Status do lead"
      aria-busy={saving}
    >
      {Object.entries(LEAD_STATUS_MAP).map(([value, { label }]) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  )
}
