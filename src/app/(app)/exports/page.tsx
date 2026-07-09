import { redirect } from 'next/navigation'

/**
 * Alias EN legado consolidado na rota canonica PT (route-drift sweep 2026-06-23):
 * /exports e /exportar/historico montavam o MESMO componente (ExportHistoryTable).
 * Manter duas implementacoes da mesma tela e risco de drift; /exports agora
 * redireciona para a rota canonica.
 */
export default function Page() {
  redirect('/exportar/historico')
}
