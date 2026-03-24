import type { Metadata } from 'next'
import Link from 'next/link'
import { Routes } from '@/lib/constants/routes'
import { InviteActivationForm } from './invite-activation-form'

export const metadata: Metadata = {
  title: 'Ativar conta',
  robots: { index: false, follow: false },
}

interface InvitePageProps {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params

  // Validação server-side do token (COMP-004 — TASK-1/ST005)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  let inviteEmail: string | null = null
  let isInvalid = false

  try {
    const res = await fetch(`${baseUrl}/api/v1/invites/${token}`, {
      cache: 'no-store',
    })
    if (res.ok) {
      const body = await res.json()
      inviteEmail = body.data?.email ?? null
    } else {
      isInvalid = true
    }
  } catch {
    // Fallback: deixar o form tratar o erro no submit
    // (ex: NEXT_PUBLIC_APP_URL ausente em dev)
  }

  if (isInvalid) {
    return (
      <main
        data-testid="invite-page"
        className="min-h-screen flex items-center justify-center bg-background p-8"
      >
        <div className="w-full max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-destructive">Convite inválido</h1>
          <p className="text-muted-foreground">
            Este link de convite expirou ou já foi utilizado. Solicite um novo convite ao
            administrador.
          </p>
          <Link
            href={Routes.LOGIN}
            className="text-primary hover:underline underline-offset-4 text-sm"
          >
            Ir para o login
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main
      data-testid="invite-page"
      className="min-h-screen flex items-center justify-center bg-background p-8"
    >
      <div data-testid="invite-form-container" className="w-full max-w-md">
        {inviteEmail && (
          <p className="text-sm text-muted-foreground mb-6">
            Conta:{' '}
            <span className="font-medium text-foreground">{inviteEmail}</span>
          </p>
        )}
        <InviteActivationForm token={token} />
      </div>
    </main>
  )
}
