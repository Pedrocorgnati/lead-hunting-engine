'use client'
import { Button } from './button'
import { Loader2 } from 'lucide-react'
import type { ComponentProps } from 'react'

interface LoadingButtonProps extends ComponentProps<typeof Button> {
  loading?: boolean
}

export function LoadingButton({ loading, disabled, children, ...props }: LoadingButtonProps) {
  return (
    <Button disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  )
}
