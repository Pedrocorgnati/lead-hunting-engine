import { Skeleton } from '@/components/ui/skeleton'

export default function ColetasLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-56 mt-1" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="space-y-3" aria-busy="true" aria-label="Carregando coletas">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
