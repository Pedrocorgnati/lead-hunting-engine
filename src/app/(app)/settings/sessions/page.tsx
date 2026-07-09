import { redirect } from 'next/navigation'

/**
 * Alias EN legado consolidado na rota canonica PT (route-drift sweep 2026-06-23):
 * a UI de sessoes ativas (TASK-17) ja vive em /perfil/seguranca, que tambem
 * cobre senha e reautenticacao. Manter uma segunda implementacao da mesma tela
 * em /settings/sessions e risco de drift; agora redireciona para a canonica.
 */
export default function Page() {
  redirect('/perfil/seguranca')
}
