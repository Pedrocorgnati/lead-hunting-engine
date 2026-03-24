import { Rocket } from 'lucide-react'

interface Props {
  role: string
}

export function StepWelcome({ role }: Props) {
  const isAdmin = role === 'ADMIN'
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <div className="rounded-full bg-primary/10 p-6">
          <Rocket className="h-12 w-12 text-primary" aria-hidden="true" />
        </div>
      </div>
      <h2 className="text-2xl font-bold">Bem-vindo ao Lead Hunting Engine!</h2>
      <p className="text-muted-foreground max-w-sm mx-auto">
        {isAdmin
          ? 'Vamos configurar sua plataforma em poucos minutos. Configure as credenciais de API, ajuste o scoring e convide sua equipe.'
          : 'Vamos mostrar como usar a plataforma para encontrar leads de alto valor para seu negócio.'
        }
      </p>
    </div>
  )
}
