import { NpsDashboard } from '@/components/admin/NpsDashboard'

export const metadata = {
  title: 'Feedback (NPS)',
}

export default function AdminFeedbackPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Feedback dos usuarios</h1>
        <p className="text-sm text-muted-foreground">
          NPS coletado via widget in-app. Filtre por periodo e bucket para
          investigar detractores e oportunidades.
        </p>
      </div>
      <NpsDashboard />
    </div>
  )
}
