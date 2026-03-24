'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface TermsCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string
}

export const TermsCheckbox = forwardRef<HTMLInputElement, TermsCheckboxProps>(
  ({ checked, onChange, error }, ref) => {
    const id = 'terms-accept'
    return (
      <div className="space-y-1">
        <label
          className={cn(
            'flex items-start gap-3 cursor-pointer',
            error && 'text-destructive'
          )}
        >
          <input
            ref={ref}
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
            aria-required
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <span className="text-sm text-muted-foreground">
            Li e aceito os{' '}
            <a
              href="/termos"
              target="_blank"
              rel="noreferrer"
              className="underline text-primary hover:text-primary/80"
            >
              termos de uso
            </a>{' '}
            e a{' '}
            <a
              href="/privacidade"
              target="_blank"
              rel="noreferrer"
              className="underline text-primary hover:text-primary/80"
            >
              política de privacidade
            </a>{' '}
            (LGPD)
          </span>
        </label>
        {error && (
          <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }
)
TermsCheckbox.displayName = 'TermsCheckbox'
