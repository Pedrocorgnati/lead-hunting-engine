import { Skeleton } from '@/components/ui/skeleton'

export default function LeadDetailLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-6" aria-busy="true" aria-label="Carregando detalhe do lead...">
      {/* Back link */}
      <Skeleton className="h-4 w-32" />

      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      {/* Status + badge */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      {/* Score breakdown */}
      <Skeleton className="h-48 rounded-lg" />

      {/* Lifecycle tracker */}
      <Skeleton className="h-24 rounded-lg" />

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex gap-4 border-b">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-16" />
        </div>
        <Skeleton className="h-40 rounded-lg" />
      </div>
    </div>
  )
}
