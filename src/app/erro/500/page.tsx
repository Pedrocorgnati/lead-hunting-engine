import type { Metadata } from 'next'
import { ErrorExperience } from '@/components/errors/error-experience'

export const metadata: Metadata = {
  title: 'Falha inesperada',
  robots: { index: false, follow: false },
}

export default function Error500Page() {
  return <ErrorExperience kind="500" />
}

