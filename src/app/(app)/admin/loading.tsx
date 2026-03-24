import { Skeleton } from '@/components/ui/skeleton'

export default function AdminLoading() {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center px-4"
      aria-busy="true"
      aria-label="Carregando"
    >
      <div className="w-full max-w-lg space-y-8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48 rounded-full" />
          <Skeleton className="h-8 w-20" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
