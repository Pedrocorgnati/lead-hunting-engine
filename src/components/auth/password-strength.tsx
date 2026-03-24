'use client'

import { useMemo } from 'react'
import zxcvbn from 'zxcvbn'
import { cn } from '@/lib/utils'

interface PasswordStrengthProps {
  password: string
}

const levels = [
  { label: 'Muito fraca', color: 'bg-destructive' },
  { label: 'Fraca', color: 'bg-warning' },
  { label: 'Razoável', color: 'bg-warning/70' },
  { label: 'Boa', color: 'bg-success/80' },
  { label: 'Excelente', color: 'bg-success' },
] as const

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const result = useMemo(() => (password ? zxcvbn(password) : null), [password])
  if (!password) return null

  const score = result?.score ?? 0
  const { label, color } = levels[score]

  return (
    <div className="space-y-1" role="status" aria-label={`Força da senha: ${label}`}>
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i < score ? color : 'bg-muted'
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Força: {label}</p>
      {result?.feedback.suggestions?.[0] && (
        <p className="text-xs text-muted-foreground">{result.feedback.suggestions[0]}</p>
      )}
    </div>
  )
}
