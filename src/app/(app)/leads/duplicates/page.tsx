import { redirect } from 'next/navigation'

/**
 * Alias EN orfao consolidado na rota canonica PT (ECU sweep 2026-06-09):
 * nenhuma superficie de navegacao apontava para ca; manter duas
 * implementacoes divergentes da mesma tela e risco de drift.
 */
export default function Page() {
  redirect('/leads/duplicatas')
}
