import { ContactMessagesTable } from '@/components/admin/ContactMessagesTable'

export const metadata = {
  title: 'Mensagens de contato',
}

export default function AdminContactMessagesPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Mensagens de contato</h1>
        <p className="text-sm text-muted-foreground">
          Recebidas pela landing. Visualize, responda e arquive.
        </p>
      </div>
      <ContactMessagesTable />
    </div>
  )
}
