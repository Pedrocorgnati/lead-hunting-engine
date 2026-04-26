'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * NotificationPermissionBanner
 * ============================
 *
 * Aviso inline quando o usuario bloqueou (Notification.permission === 'denied')
 * ou ainda nao decidiu ('default') a permissao de push.
 *
 * - 'granted' -> nao renderiza
 * - 'default' -> oferece botao "Ativar"
 * - 'denied'  -> informa que precisa desbloquear nas preferencias do navegador
 *
 * Origem: INTAKE-REVIEW TASK-9 / ST004 / CL-133.
 */
export function NotificationPermissionBanner() {
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported' | 'loading'>('loading')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      setPerm('unsupported')
      return
    }
    setPerm(Notification.permission)
  }, [])

  if (dismissed) return null
  if (perm === 'loading' || perm === 'unsupported' || perm === 'granted') return null

  async function requestPermission() {
    if (typeof Notification === 'undefined') return
    try {
      const next = await Notification.requestPermission()
      setPerm(next)
    } catch {
      // ignore — user pode ter fechado o dialog
    }
  }

  const denied = perm === 'denied'

  return (
    <div
      data-testid="notification-permission-banner"
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden={true} />
      <div className="flex-1 space-y-1">
        <p className="text-sm font-semibold">
          {denied
            ? 'Notificacoes push estao bloqueadas pelo navegador'
            : 'Ative as notificacoes push'}
        </p>
        <p className="text-sm">
          {denied
            ? 'Libere a permissao nas configuracoes do navegador para receber avisos imediatos de coletas concluidas, leads quentes e credenciais expirando. Enquanto isso, voce continuara recebendo pelos canais alternativos (email e central in-app).'
            : 'Permita notificacoes para ser avisado imediatamente quando um lead quente chegar, uma coleta terminar ou uma credencial estiver prestes a expirar.'}
        </p>
        {!denied && (
          <div className="pt-1">
            <Button
              data-testid="notification-permission-enable"
              size="sm"
              onClick={requestPermission}
            >
              Ativar notificacoes
            </Button>
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Dispensar aviso"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-md p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40"
      >
        <X className="h-4 w-4" aria-hidden={true} />
      </button>
    </div>
  )
}
