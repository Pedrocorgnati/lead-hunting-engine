import { Skeleton } from '@/components/ui/skeleton'

export default function ExportarLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando exportacao">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 mt-1" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
