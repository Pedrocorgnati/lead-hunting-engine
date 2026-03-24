import { Skeleton } from '@/components/ui/skeleton'

export default function PerfilLoading() {
  return (
    <div className="space-y-6 max-w-2xl" aria-busy="true" aria-label="Carregando perfil">
      <div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-48 mt-1" />
      </div>
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  )
}
