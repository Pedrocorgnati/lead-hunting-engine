import { Badge } from './badge'
import type { LeadStatus, LeadTemperature } from '@/lib/constants'
import { LEAD_STATUS_MAP, LEAD_TEMPERATURE_MAP } from '@/lib/constants'

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const { label, variant } = LEAD_STATUS_MAP[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function TemperatureBadge({ temperature }: { temperature: LeadTemperature }) {
  const { label, variant } = LEAD_TEMPERATURE_MAP[temperature]
  return <Badge variant={variant}>{label}</Badge>
}
