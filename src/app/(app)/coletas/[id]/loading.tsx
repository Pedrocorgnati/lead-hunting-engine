import { Skeleton } from '@/components/ui/skeleton'

export default function CollectionDetailLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-6" aria-busy="true" aria-label="Carregando detalhes da coleta">
      <Skeleton className="h-4 w-32" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
