'use client'

import { Toaster, toast as sonnerToast } from 'sonner'
import type { ReactNode } from 'react'

/**
 * ToastCenter — contrato visual unico do sistema de toast (sonner).
 *
 * Garante que acoes do app nunca fiquem silenciosas (Zero Silencio) e que
 * todo feedback compartilhe a mesma severidade, auto-dismiss, aria-live e
 * limite de empilhamento. E o UNICO ponto de montagem do Toaster no app:
 * - root layout monta <ToastCenter />;
 * - wrappers legados (components/ui/toast, providers/toast-provider)
 *   delegam para este modulo, nunca configuram um Toaster proprio.
 *
 * Contrato coberto:
 * - severidade: success / error / warning / info via classNames por severidade
 *   (palette alinhado aos design tokens do app — fonte unica de verdade, sem
 *   richColors para evitar que os seletores de atributo do sonner sobreponham
 *   as cores do tema);
 * - acao opcional: parametro `action` repassado a sonner (botao no toast);
 * - auto-dismiss: `duration` padrao (DEFAULT_DURATION), override por chamada;
 * - aria-live: o Toaster da sonner renderiza uma regiao com aria-live="polite"
 *   (assertive para erros), anunciada a leitores de tela sem foco roubado;
 * - limite de empilhamento: `visibleToasts` colapsa a pilha (Zero ruido visual).
 */

const DEFAULT_DURATION = 4000
const MAX_VISIBLE_TOASTS = 3

export function ToastCenter() {
  return (
    <Toaster
      position="top-right"
      visibleToasts={MAX_VISIBLE_TOASTS}
      toastOptions={{
        duration: DEFAULT_DURATION,
        classNames: {
          toast: 'rounded-lg border shadow-lg text-sm font-sans',
          error: 'border-destructive/30 bg-destructive/5 text-destructive',
          success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          warning: 'border-amber-200 bg-amber-50 text-amber-700',
          info: 'border-sky-200 bg-sky-50 text-sky-700',
        },
      }}
      closeButton
    />
  )
}

/** Acao opcional anexada a um toast (rotulo + handler). */
export type ToastAction = {
  label: string
  onClick: () => void
}

type NotifyOptions = {
  description?: ReactNode
  /** Override de auto-dismiss em ms. Omitir usa DEFAULT_DURATION. */
  duration?: number
  /** Botao de acao opcional dentro do toast. */
  action?: ToastAction
}

/**
 * Helper canonico de feedback. Encapsula severidade + acao opcional + auto-dismiss
 * sob uma unica API, evitando chamadas dispersas e divergentes de toast.* pelo app.
 */
export const notify = {
  success: (message: ReactNode, opts?: NotifyOptions) =>
    sonnerToast.success(message, opts),
  error: (message: ReactNode, opts?: NotifyOptions) =>
    sonnerToast.error(message, opts),
  warning: (message: ReactNode, opts?: NotifyOptions) =>
    sonnerToast.warning(message, opts),
  info: (message: ReactNode, opts?: NotifyOptions) =>
    sonnerToast.info(message, opts),
}

// Re-export do primitivo para call-sites que precisam da API completa do sonner
// (promise, loading, custom). Mantem o ToastCenter como modulo unico de import.
export { sonnerToast as toast }
