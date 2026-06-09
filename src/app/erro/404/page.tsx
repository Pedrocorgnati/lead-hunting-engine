import type { Metadata } from 'next'
import { ErrorExperience } from '@/components/errors/error-experience'

export const metadata: Metadata = {
  title: 'Página não encontrada',
  robots: { index: false, follow: false },
}

export default function Error404Page() {
  return <ErrorExperience kind="404" />
}

