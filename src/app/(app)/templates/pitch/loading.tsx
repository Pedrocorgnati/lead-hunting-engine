import { Skeleton } from '@/components/ui/skeleton'

export default function TemplatesPitchLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando templates de pitch">
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-64 mt-1" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
