import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { Routes } from '@/lib/constants/routes'

export const metadata: Metadata = {
  title: 'Política de Onboarding — Admin',
  description:
    'Como o assistente de primeiros passos funciona: o que cada etapa captura, o que acontece ao pular e como retomar de outro dispositivo.',
  robots: { index: false, follow: false },
}

/**
 * /admin/onboarding-policy — versão renderizada da doc client-facing
 * `output/docs/lead-hunting-engine/admin/onboarding-policy.md`
 * (TASK-7 / M7-G04). Mantida em sincronia manualmente; ao alterar a doc,
 * espelhar aqui.
 */
export default async function OnboardingPolicyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await prisma.userProfile.findUnique({
    where: { id: user.id },
    select: { role: true },
  })
  // Política pode ser lida por qualquer usuário autenticado, mas a navegação
  // de retorno aponta para a área condizente com o role.
  const backHref = profile?.role === 'ADMIN' ? Routes.ADMIN : Routes.DASHBOARD

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Política administrativa
        </p>
        <h1 className="text-2xl font-bold text-foreground">
          Onboarding — Política de Pular e Retomar
        </h1>
        <p className="text-sm text-muted-foreground">
          Guia rápido para administradores e operadores entenderem o assistente
          de primeiros passos.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. O que cada etapa captura</h2>

        <div className="space-y-2">
          <h3 className="text-base font-semibold">Para administradores (5 etapas)</h3>
          <ol className="list-decimal space-y-1 pl-6 text-sm text-muted-foreground">
            <li><strong>Boas-vindas</strong> — apenas uma introdução ao produto.</li>
            <li><strong>Perfil da empresa</strong> — nome, tipo de operação (B2B / B2C / B2B2C) e CNPJ opcional.</li>
            <li><strong>Nichos</strong> — até 20 segmentos do público-alvo.</li>
            <li><strong>Regiões</strong> — UFs e cidades onde a operação concentra esforços.</li>
            <li><strong>Concluir</strong> — resumo e atalho para iniciar a primeira coleta.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            O admin que pula o onboarding mantém acesso completo ao painel; a configuração pode ser refeita em <code>/admin/configuracoes</code>.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-base font-semibold">Para operadores (3 etapas)</h3>
          <ol className="list-decimal space-y-1 pl-6 text-sm text-muted-foreground">
            <li><strong>Boas-vindas</strong> — orientação sobre o produto.</li>
            <li><strong>Coletas</strong> — visão geral do motor de coleta.</li>
            <li><strong>Leads</strong> — visão geral do painel de trabalho.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            O operador não captura ICP — quem define perfil, nichos e regiões é o admin.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">2. Pular onboarding sem prejuízo</h2>
        <p className="text-sm text-muted-foreground">
          O botão <strong>&ldquo;Pular tudo&rdquo;</strong> está sempre visível em todas as etapas. Quando você clica, o sistema marca seu onboarding como concluído e você é redirecionado para <code>/dashboard</code>. Nenhuma funcionalidade fica bloqueada.
        </p>
        <p className="text-sm text-muted-foreground">
          Se você é o único administrador da conta e ainda não configurou ICP, recomendamos preencher pelo menos as etapas de regiões e nichos antes de pular.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">3. Retomada cross-device</h2>
        <p className="text-sm text-muted-foreground">
          O onboarding é persistido no banco de dados, não no navegador. Você pode começar no notebook e terminar no celular com a mesma conta logada — o progresso e os dados preenchidos aparecem automaticamente. Limpar cookies ou trocar de browser não apaga o progresso.
        </p>
        <p className="text-sm text-muted-foreground">
          Ao avançar de uma etapa para outra, o sistema faz merge superficial dos dados. A única forma de resetar o onboarding é via banco (operação administrativa).
        </p>
      </section>

      <footer className="border-t border-border pt-4">
        <Link
          href={backHref}
          className="text-sm text-primary underline hover:no-underline"
          data-testid="onboarding-policy-back"
        >
          ← Voltar
        </Link>
      </footer>
    </main>
  )
}
