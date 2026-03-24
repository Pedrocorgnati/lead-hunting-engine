import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  cta?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon = Inbox, title, description, cta, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <Icon className="h-12 w-12 text-muted-foreground mb-4" aria-hidden />
      <h3 className="font-semibold text-foreground">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  )
}
