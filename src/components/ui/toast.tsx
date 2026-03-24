'use client'
import { Toaster as SonnerToaster } from 'sonner'

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast: 'font-sans',
        },
      }}
    />
  )
}

export { toast } from 'sonner'
