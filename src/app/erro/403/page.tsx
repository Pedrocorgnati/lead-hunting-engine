import type { Metadata } from 'next'
import { ForbiddenExperience } from '@/components/errors/forbidden-experience'

export const metadata: Metadata = {
  title: 'Acesso negado',
  robots: { index: false, follow: false },
}

export default function Error403Page() {
  return <ForbiddenExperience />
}
