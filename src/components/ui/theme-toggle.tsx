'use client'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from './button'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const icons = {
    light: <Sun className="h-4 w-4" />,
    dark: <Moon className="h-4 w-4" />,
    system: <Monitor className="h-4 w-4" />,
  }

  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  const labels = { light: 'Modo claro', dark: 'Modo escuro', system: 'Sistema' }

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
