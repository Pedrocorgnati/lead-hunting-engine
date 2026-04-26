import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Variant = 'table' | 'card' | 'detail'

interface LoadingSkeletonProps {
  variant?: Variant
  rows?: number
  className?: string
}

export function LoadingSkeleton({ variant = 'card', rows = 3, className }: LoadingSkeletonProps) {
  if (variant === 'table') {
    return (
      <div className={cn('space-y-2', className)}>
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (variant === 'detail') {
    return (
      <div className={cn('space-y-4', className)}>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className={cn('grid gap-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-md border p-4">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  )
}
