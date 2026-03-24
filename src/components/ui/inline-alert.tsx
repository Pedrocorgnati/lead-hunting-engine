import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'

type AlertVariant = 'info' | 'success' | 'warning' | 'error'

interface InlineAlertProps {
  variant: AlertVariant
  title?: string
  message: string
  className?: string
}

const infoBg = 'bg-[var(--color-info)]/10 text-[var(--color-info)] border-[var(--color-info)]/25'
const successBg = 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/25'
const warningBg = 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/25'
const errorBg = 'bg-destructive/10 text-destructive border-destructive/25'

const variantConfig: Record<AlertVariant, { icon: typeof Info; classes: string }> = {
  info: { icon: Info, classes: infoBg },
  success: { icon: CheckCircle, classes: successBg },
  warning: { icon: AlertTriangle, classes: warningBg },
  error: { icon: AlertCircle, classes: errorBg },
}

export function InlineAlert({ variant, title, message, className }: InlineAlertProps) {
  const { icon: Icon, classes } = variantConfig[variant]
  return (
    <div className={cn('flex gap-3 rounded-md border p-3', classes, className)} role="alert">
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden />
      <div>
        {title && <p className="font-medium text-sm">{title}</p>}
        <p className="text-sm">{message}</p>
      </div>
    </div>
  )
}
