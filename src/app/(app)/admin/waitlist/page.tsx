import { WaitlistTable } from '@/components/admin/WaitlistTable'

export const metadata = {
  title: 'Waitlist',
}

export default function AdminWaitlistPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Waitlist</h1>
        <p className="text-sm text-muted-foreground">
          Inscritos na landing. Convide em um clique para criar o acesso.
        </p>
      </div>
      <WaitlistTable />
    </div>
  )
}
