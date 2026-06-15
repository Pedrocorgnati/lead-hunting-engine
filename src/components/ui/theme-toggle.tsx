'use client'
import { useSyncExternalStore } from 'react'
import { useTheme } from '@/components/providers/theme-provider'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from './button'

const emptySubscribe = () => () => {}

/**
 * true apos a hidratacao; false no SSR e no 1o render do cliente. Padrao oficial
 * (useSyncExternalStore) para detectar hidratacao sem setState-em-effect.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // No SSR o tema e desconhecido. Renderizar
  // o toggle real no SSR causa hydration mismatch (server 'light' Sun/"Modo claro"
  // vs cliente tema real Moon/"Sistema"). Antes da hidratacao mostramos um
  // placeholder estavel; o toggle real aparece apos hidratar.
  const hydrated = useHydrated()

  const icons = {
    light: <Sun className="h-4 w-4" />,
    dark: <Moon className="h-4 w-4" />,
    system: <Monitor className="h-4 w-4" />,
  }

  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  const labels = { light: 'Modo claro', dark: 'Modo escuro', system: 'Sistema' }

  if (!hydrated) {
    return (
      <Button variant="ghost" size="icon" aria-label="Alternar tema" disabled>
        <Sun className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`Alternar para ${labels[next as keyof typeof labels]}`}
    >
      {icons[(theme as keyof typeof icons) ?? 'light']}
    </Button>
  )
}
