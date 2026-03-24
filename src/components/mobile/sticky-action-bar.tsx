import { cn } from '@/lib/utils'

interface StickyActionBarProps {
  children: React.ReactNode
  className?: string
}

export function StickyActionBar({ children, className }: StickyActionBarProps) {
  return (
    <div
      data-testid="sticky-action-bar"
      className={cn(
        'fixed bottom-16 inset-x-0 z-30 px-4 md:hidden',
        className
      )}
    >
      <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-xl border border-border shadow-lg p-3">
        {children}
      </div>
    </div>
  )
}
