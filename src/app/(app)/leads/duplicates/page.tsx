import { DuplicateResolver } from '@/components/leads/DuplicateResolver'

export const metadata = { title: 'Duplicatas' }

export default function DuplicatesPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Resolver duplicatas</h1>
        <p className="text-sm text-muted-foreground">
          Leads com alta similaridade que precisam de revisao humana. Escolha
          qual registro manter ou marque os pares como distintos.
        </p>
      </div>
      <DuplicateResolver />
    </div>
  )
}
