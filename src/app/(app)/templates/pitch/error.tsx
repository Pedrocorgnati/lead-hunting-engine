'use client'

import { ErrorExperience } from '@/components/errors/error-experience'

export default function TemplatesPitchError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorExperience kind="500" digest={error.digest} onRetry={reset} />
}
