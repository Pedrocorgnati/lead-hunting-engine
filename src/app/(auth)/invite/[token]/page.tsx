import type { Metadata } from 'next'
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

  // TODO: Validate token server-side — run /auto-flow execute
  // For now, render the form (token validation is stubbed)
  return (
    <main data-testid="invite-page" className="min-h-screen flex items-center justify-center bg-background p-8">
      <div data-testid="invite-form-container" className="w-full max-w-md">
        <InviteActivationForm token={token} />
      </div>
    </main>
  )
}
