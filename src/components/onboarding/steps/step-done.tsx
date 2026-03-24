import { PartyPopper } from 'lucide-react'

export function StepDone() {
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <div className="rounded-full bg-success/10 p-6">
          <PartyPopper className="h-12 w-12 text-success" aria-hidden="true" />
        </div>
      </div>
      <h2 className="text-2xl font-bold">Tudo pronto!</h2>
      <p className="text-muted-foreground max-w-sm mx-auto">
        Sua plataforma está configurada. Clique em &quot;Ir para o Dashboard&quot; para começar.
      </p>
    </div>
  )
}
