import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'

export const metadata: Metadata = {
  title: 'Configuração inicial — Lead Hunting Engine',
  robots: { index: false, follow: false },
}

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await prisma.userProfile.findUnique({
    where: { id: user.id },
    select: { onboardingCompletedAt: true },
  })

  if (profile?.onboardingCompletedAt) redirect('/dashboard')

  return (
    <main>
      <OnboardingWizard />
    </main>
  )
}
